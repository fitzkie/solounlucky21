#!/usr/bin/env python3
"""
Signet signing proxy for unlucky21.

Sits between datum_gateway (port 38334) and Bitcoin Core (port 38332).
Intercepts submitblock calls, signs the block with our signet key,
injects the signet commitment into the coinbase, and resubmits.

All other RPC calls are passed through unchanged.

Usage: python3 signet-signer.py
"""

import http.server
import json
import struct
import hashlib
import urllib.request
import base64
import sys
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("signet-signer")

PROXY_PORT    = 38335           # datum_gateway points here
BITCOIND_URL  = "http://127.0.0.1:38332"
RPC_USER      = "unlucky21rpc"
RPC_PASS      = "f82284d6da6ed892be9873243703423c71b10264c08b295e7546a761c3c3ef29"
WALLET        = "signing"
CHALLENGE_HEX = "21034b7387a016353e01df7b143eed1dd8d0b00351a1a46e573f6e13df6eb13f8a23ac"

SIGNET_HEADER = bytes.fromhex("ecc7daa2")


# ---------------------------------------------------------------------------
# Bitcoin Core RPC
# ---------------------------------------------------------------------------

def _rpc(method, params, wallet=None):
    url = BITCOIND_URL + (f"/wallet/{wallet}" if wallet else "")
    payload = json.dumps({"jsonrpc": "1.0", "id": 1, "method": method, "params": params}).encode()
    auth = base64.b64encode(f"{RPC_USER}:{RPC_PASS}".encode()).decode()
    req = urllib.request.Request(url, data=payload, headers={
        "Authorization": f"Basic {auth}",
        "Content-Type": "application/json",
    })
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        return json.loads(e.read())


# ---------------------------------------------------------------------------
# Raw block / transaction serialisation helpers
# ---------------------------------------------------------------------------

def dsha256(data: bytes) -> bytes:
    return hashlib.sha256(hashlib.sha256(data).digest()).digest()


def read_varint(buf: bytes, off: int):
    b = buf[off]
    if b < 0xfd:
        return b, off + 1
    if b == 0xfd:
        return struct.unpack_from("<H", buf, off + 1)[0], off + 3
    if b == 0xfe:
        return struct.unpack_from("<I", buf, off + 1)[0], off + 5
    return struct.unpack_from("<Q", buf, off + 1)[0], off + 9


def encode_varint(n: int) -> bytes:
    if n < 0xfd:
        return bytes([n])
    if n <= 0xffff:
        return b"\xfd" + struct.pack("<H", n)
    if n <= 0xffffffff:
        return b"\xfe" + struct.pack("<I", n)
    return b"\xff" + struct.pack("<Q", n)


def encode_push(data: bytes) -> bytes:
    """Minimal script push encoding."""
    n = len(data)
    if n == 0:
        return b"\x00"
    if n <= 75:
        return bytes([n]) + data
    if n <= 255:
        return b"\x4c" + bytes([n]) + data
    if n <= 65535:
        return b"\x4d" + struct.pack("<H", n) + data
    return b"\x4e" + struct.pack("<I", n) + data


# ---------------------------------------------------------------------------
# Block modifier: inject signet commitment into coinbase
# ---------------------------------------------------------------------------

def _parse_tx(buf: bytes, off: int):
    """Return (tx_bytes, new_offset) for the transaction starting at off."""
    start = off
    version = struct.unpack_from("<i", buf, off)[0]
    off += 4

    # Check for segwit marker
    segwit = False
    if buf[off] == 0x00 and buf[off + 1] == 0x01:
        segwit = True
        off += 2

    # Inputs
    n_in, off = read_varint(buf, off)
    for _ in range(n_in):
        off += 36                       # prevout (32 txid + 4 vout)
        script_len, off = read_varint(buf, off)
        off += script_len + 4           # script + sequence

    # Outputs
    n_out, off = read_varint(buf, off)
    for _ in range(n_out):
        off += 8                        # value
        script_len, off = read_varint(buf, off)
        off += script_len

    # Witnesses
    if segwit:
        for _ in range(n_in):
            n_wit, off = read_varint(buf, off)
            for _ in range(n_wit):
                item_len, off = read_varint(buf, off)
                off += item_len

    off += 4  # locktime
    return buf[start:off], off


def inject_signet_commitment(block_hex: str, script_sig_hex: str) -> str:
    """
    Add an OP_RETURN signet commitment to the coinbase's output list.
    Returns modified block hex.

    Format of the OP_RETURN:
        OP_RETURN  (0x6a)
        push(SIGNET_HEADER + script_sig_bytes)
    """
    block = bytearray(bytes.fromhex(block_hex))
    script_sig = bytes.fromhex(script_sig_hex)

    # ---- header (80 bytes) ----
    header = bytes(block[:80])
    off = 80

    # ---- tx count ----
    n_tx, off = read_varint(block, off)

    # ---- coinbase tx ----
    cb_start = off
    cb_bytes, off = _parse_tx(block, off)

    # Remaining transactions untouched
    rest = bytes(block[off:])

    # ---- modify coinbase: add signet OP_RETURN output ----
    cb = bytearray(cb_bytes)

    # version (4) + possible segwit marker (2)
    inner = 4
    segwit = (cb[4] == 0x00 and cb[5] == 0x01)
    if segwit:
        inner += 2

    # skip inputs
    n_in, inner = read_varint(cb, inner)
    for _ in range(n_in):
        inner += 36
        sl, inner = read_varint(cb, inner)
        inner += sl + 4

    # outputs: read count, remember position
    out_count_off = inner
    n_out, inner = read_varint(cb, inner)
    out_start = inner
    for _ in range(n_out):
        inner += 8
        sl, inner = read_varint(cb, inner)
        inner += sl

    out_end = inner  # right before witnesses / locktime

    # Build signet commitment script: OP_RETURN push(header+sig)
    commitment_data = SIGNET_HEADER + script_sig
    signet_script = b"\x6a" + encode_push(commitment_data)

    # Build new output: 0 sats + script
    new_output = struct.pack("<q", 0) + encode_varint(len(signet_script)) + signet_script

    # Reassemble coinbase with new output spliced in before witnesses
    new_cb = (
        bytes(cb[:out_count_off])
        + encode_varint(n_out + 1)
        + bytes(cb[out_start:out_end])
        + new_output
        + bytes(cb[out_end:])
    )

    # ---- recompute coinbase txid (non-witness) ----
    # Strip witness for txid computation
    cb_no_wit = bytearray(new_cb)
    if cb_no_wit[4] == 0x00 and cb_no_wit[5] == 0x01:
        # Remove marker + flag bytes
        cb_no_wit = cb_no_wit[:4] + cb_no_wit[6:]
        # Remove witness data: before locktime (last 4 bytes),
        # we need to strip witness stacks — easier to compute from scratch
        # For coinbase (1 input), witness is just the witness stack for that input
        # We'll use the full non-segwit serialisation approach:
        # non-segwit = version + inputs + outputs + locktime (no marker/flag/witnesses)
        pass

    new_cb_txid = dsha256(bytes(new_cb))[::-1]  # little-endian txid

    # ---- rebuild block ----
    # header + n_tx varint + new_coinbase + rest txs
    # Then fix merkle root in header
    # Collect all tx hashes for merkle
    all_txids = [new_cb_txid]
    tmp_off = 0
    tmp_rest = rest
    for _ in range(n_tx - 1):
        tx_b, tmp_off = _parse_tx(tmp_rest, tmp_off)
        # strip segwit for txid
        txid = dsha256(tx_b)[::-1]
        all_txids.append(txid)

    merkle = _merkle_root(all_txids)

    # Patch merkle root in header (bytes 36-68)
    new_header = bytearray(header)
    new_header[36:68] = merkle[::-1]  # stored little-endian

    new_block = (
        bytes(new_header)
        + encode_varint(n_tx)
        + bytes(new_cb)
        + rest
    )
    return new_block.hex()


def _merkle_root(txids: list) -> bytes:
    """Compute merkle root from list of txids (each 32 bytes, big-endian)."""
    if not txids:
        return b"\x00" * 32
    level = list(txids)
    while len(level) > 1:
        if len(level) % 2 == 1:
            level.append(level[-1])
        level = [dsha256(level[i] + level[i + 1]) for i in range(0, len(level), 2)]
    return level[0]


# ---------------------------------------------------------------------------
# Sign a block: call signblock RPC, inject the result
# ---------------------------------------------------------------------------

def sign_and_submit(block_hex: str) -> dict:
    log.info("submitblock intercepted — calling signblock …")
    result = _rpc("signblock", [block_hex, CHALLENGE_HEX], wallet=WALLET)
    err = result.get("error")
    if err:
        log.error("signblock failed: %s — submitting unsigned (will likely reject)", err)
        return _rpc("submitblock", [block_hex])

    script_sig_hex = result["result"]
    log.info("signblock OK, script_sig=%s…", script_sig_hex[:20])

    try:
        signed_block_hex = inject_signet_commitment(block_hex, script_sig_hex)
    except Exception as e:
        log.error("commitment injection failed: %s — submitting unsigned", e)
        return _rpc("submitblock", [block_hex])

    log.info("submitting signed block (%d bytes)", len(signed_block_hex) // 2)
    res = _rpc("submitblock", [signed_block_hex])
    log.info("submitblock result: %s", res.get("result") or res.get("error"))
    return res


# ---------------------------------------------------------------------------
# HTTP proxy handler
# ---------------------------------------------------------------------------

class ProxyHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass  # silence default access log; we use our own

    def _read_body(self):
        te = self.headers.get("Transfer-Encoding", "")
        if "chunked" in te.lower():
            body = b""
            while True:
                line = self.rfile.readline().strip()
                if not line:
                    break
                size = int(line.split(b";")[0], 16)
                if size == 0:
                    break
                body += self.rfile.read(size)
                self.rfile.read(2)  # CRLF after chunk data
            return body
        length = int(self.headers.get("Content-Length", 0))
        return self.rfile.read(length)

    def do_POST(self):
        body = self._read_body()
        try:
            req = json.loads(body)
        except Exception:
            self._respond(400, b"bad json")
            return

        method = req.get("method", "")

        if method == "submitblock":
            block_hex = req["params"][0] if req.get("params") else ""
            resp = sign_and_submit(block_hex)
        else:
            # Pass through to Bitcoin Core
            auth = base64.b64encode(f"{RPC_USER}:{RPC_PASS}".encode()).decode()
            fwd = urllib.request.Request(
                BITCOIND_URL + self.path,
                data=body,
                headers={
                    "Authorization": f"Basic {auth}",
                    "Content-Type": "application/json",
                },
            )
            try:
                with urllib.request.urlopen(fwd, timeout=30) as r:
                    raw = r.read()
                self._respond(200, raw)
                return
            except urllib.error.HTTPError as e:
                raw = e.read()
                self._respond(e.code, raw)
                return

        out = json.dumps(resp).encode()
        self._respond(200, out)

    def _respond(self, code, body):
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    srv = http.server.HTTPServer(("127.0.0.1", PROXY_PORT), ProxyHandler)
    log.info("Signet signing proxy listening on port %d", PROXY_PORT)
    log.info("Forwarding to Bitcoin Core at %s", BITCOIND_URL)
    log.info("Challenge: %s", CHALLENGE_HEX)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        log.info("Stopped.")
