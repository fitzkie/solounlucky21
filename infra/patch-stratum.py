#!/usr/bin/env python3
"""
patch-stratum.py — Apply Unlucky21 finder-address personalization to datum_stratum.

Run on the VPS after deploying the updated C sources:
  python3 /opt/unlucky21-repo/infra/patch-stratum.py

Idempotent: each patch checks for its own marker before applying.
"""

import sys
import os

STRATUM_H    = "/opt/datum-gateway/src/datum_stratum.h"
STRATUM_C    = "/opt/datum-gateway/src/datum_stratum.c"
COINBASER_H  = "/opt/datum-gateway/src/datum_coinbaser.h"
BUILD_DIR    = "/opt/datum-gateway/build"

def patch_file(path, target, replacement, already_patched_marker, label):
    with open(path) as f:
        content = f.read()
    if already_patched_marker in content:
        print(f"[{label}] Already patched — skipping")
        return
    if target not in content:
        print(f"ERROR [{label}]: Target string not found in {path}")
        print(f"  Looking for: {target[:80]!r}...")
        sys.exit(1)
    with open(path, "w") as f:
        f.write(content.replace(target, replacement, 1))
    print(f"[{label}] Patched {os.path.basename(path)}")


# ─── 1. datum_coinbaser.h: declare datum_generate_personal_coinb2 ────────────
# Inserted before the closing #endif so datum_stratum.c (which includes
# datum_coinbaser.h) sees the declaration with the correct T_DATUM_STRATUM_JOB
# type already in scope.

with open(COINBASER_H) as f:
    cbh = f.read()

if "datum_generate_personal_coinb2" in cbh:
    print("[datum_coinbaser.h] Already patched — skipping")
else:
    idx = cbh.rfind("#endif")
    if idx < 0:
        print(f"ERROR: #endif not found in {COINBASER_H}")
        sys.exit(1)
    declaration = (
        "\n"
        "/* Unlucky21: build a personalized coinb2 for a specific miner address.\n"
        " * Finder slot (output[0]) uses btc_addr instead of the shared pool placeholder.\n"
        " * Defined in datum_coinbaser.c. */\n"
        "int datum_generate_personal_coinb2(\n"
        "    T_DATUM_STRATUM_JOB *s,\n"
        "    const char          *btc_addr,\n"
        "    char                *coinb2_out,\n"
        "    unsigned char       *coinb2_bin_out,\n"
        "    int                 *len_out\n"
        ");\n"
        "\n"
    )
    cbh = cbh[:idx] + declaration + cbh[idx:]
    with open(COINBASER_H, "w") as f:
        f.write(cbh)
    print("[datum_coinbaser.h] Added datum_generate_personal_coinb2 declaration")


# ─── 2. datum_stratum.h: add per-miner personal coinb2 fields ───────────────
# Inserted after the coinbase_selection field in T_DATUM_MINER_DATA.

STRATUM_H_TARGET = "\tunsigned char coinbase_selection;"
STRATUM_H_ADDITION = (
    "\n"
    "\t/* Unlucky21: per-miner personalized coinb2 — finder slot = connecting miner's address.\n"
    "\t * Regenerated lazily in send_mining_notify when the stratum job changes.\n"
    "\t * See datum_generate_personal_coinb2() in datum_coinbaser.c. */\n"
    "\tchar          personal_coinb2[STRATUM_COINBASE2_MAX_LEN];\n"
    "\tunsigned char personal_coinb2_bin[STRATUM_COINBASE2_MAX_LEN >> 1];\n"
    "\tint           personal_coinb2_len;\n"
    "\tbool          personal_coinb2_valid;\n"
    "\tint           personal_coinb2_job_index;\n"
)

patch_file(
    STRATUM_H,
    STRATUM_H_TARGET,
    STRATUM_H_TARGET + STRATUM_H_ADDITION,
    "personal_coinb2",
    "datum_stratum.h personal_coinb2 fields",
)


# ─── 3. datum_stratum.c: send_mining_notify — use personal coinb2 ────────────
# Replace the single `datum_socket_send_string_to_client(c, cb->coinb2)` call
# inside send_mining_notify with logic that:
#   1. Strips worker suffix from last_auth_username to get the BTC address
#   2. Lazily builds / caches personal coinb2 when the job changes
#   3. Sends personal coinb2 when available; falls back to shared coinb2

# This target string appears exactly once in send_mining_notify.
# (The block-assembly section below also has a cb->coinb2 reference but it is
#  in the memcpy path, not the send path, so the strings differ.)
COINB2_SEND_TARGET = "\tdatum_socket_send_string_to_client(c, cb->coinb2);"

COINB2_SEND_REPLACEMENT = (
    "\t/* Unlucky21: use per-miner personalized coinb2 (finder slot = miner address) */\n"
    "\t{\n"
    "\t\tconst char *coinb2_to_send = cb->coinb2;\n"
    "\t\tif (!new_block && m->last_auth_username[0] != '\\0' &&\n"
    "\t\t\t\tj->available_coinbase_outputs_count > 0) {\n"
    "\t\t\tif (!m->personal_coinb2_valid ||\n"
    "\t\t\t\t\tm->personal_coinb2_job_index != j->global_index) {\n"
    "\t\t\t\tchar _btc[REWARD_ADDR_LEN] = {0};\n"
    "\t\t\t\tconst char *_dot = strchr(m->last_auth_username, '.');\n"
    "\t\t\t\tif (_dot) {\n"
    "\t\t\t\t\tsize_t _n = (size_t)(_dot - m->last_auth_username);\n"
    "\t\t\t\t\tif (_n >= REWARD_ADDR_LEN) _n = REWARD_ADDR_LEN - 1;\n"
    "\t\t\t\t\tmemcpy(_btc, m->last_auth_username, _n);\n"
    "\t\t\t\t} else {\n"
    "\t\t\t\t\tstrncpy(_btc, m->last_auth_username, REWARD_ADDR_LEN - 1);\n"
    "\t\t\t\t}\n"
    "\t\t\t\tm->personal_coinb2_valid =\n"
    "\t\t\t\t\tdatum_generate_personal_coinb2(j, _btc,\n"
    "\t\t\t\t\t\tm->personal_coinb2,\n"
    "\t\t\t\t\t\tm->personal_coinb2_bin,\n"
    "\t\t\t\t\t\t&m->personal_coinb2_len) > 0;\n"
    "\t\t\t\tm->personal_coinb2_job_index = j->global_index;\n"
    "\t\t\t\tDLOG_DEBUG(\"Personal coinb2 %s for %s (job %d)\",\n"
    "\t\t\t\t\tm->personal_coinb2_valid ? \"built\" : \"failed\",\n"
    "\t\t\t\t\t_btc, j->global_index);\n"
    "\t\t\t}\n"
    "\t\t\tif (m->personal_coinb2_valid)\n"
    "\t\t\t\tcoinb2_to_send = m->personal_coinb2;\n"
    "\t\t}\n"
    "\t\tdatum_socket_send_string_to_client(c, coinb2_to_send);\n"
    "\t}\n"
)

patch_file(
    STRATUM_C,
    COINB2_SEND_TARGET,
    COINB2_SEND_REPLACEMENT,
    "coinb2_to_send",
    "datum_stratum.c send_mining_notify personal coinb2",
)


# ─── 4. datum_stratum.c: block assembly — use personal coinb2_bin ────────────
# Replace the three-line memcpy block that builds full_cb_txn with a version
# that substitutes the personal coinb2_bin when valid.  Introduce coinb2_len_use
# to carry the correct length through the SHA256 and assembleBlockAndSubmit calls.

ASSEMBLY_TARGET = (
    "\t\tmemcpy(&full_cb_txn[0], cb->coinb1_bin, cb->coinb1_len);\n"
    "\t\tmemcpy(&full_cb_txn[cb->coinb1_len], extranonce_bin, 12);\n"
    "\t\tmemcpy(&full_cb_txn[cb->coinb1_len+12], cb->coinb2_bin, cb->coinb2_len);"
)

ASSEMBLY_REPLACEMENT = (
    "\t\tmemcpy(&full_cb_txn[0], cb->coinb1_bin, cb->coinb1_len);\n"
    "\t\tmemcpy(&full_cb_txn[cb->coinb1_len], extranonce_bin, 12);\n"
    "\t\t/* Unlucky21: use personal coinb2 so the finder slot matches what was sent to the miner */\n"
    "\t\tint coinb2_len_use = cb->coinb2_len;\n"
    "\t\tif (!empty_work && m->personal_coinb2_valid &&\n"
    "\t\t\t\tm->personal_coinb2_job_index == job->global_index) {\n"
    "\t\t\tmemcpy(&full_cb_txn[cb->coinb1_len+12],\n"
    "\t\t\t\tm->personal_coinb2_bin, m->personal_coinb2_len);\n"
    "\t\t\tcoinb2_len_use = m->personal_coinb2_len;\n"
    "\t\t} else {\n"
    "\t\t\tmemcpy(&full_cb_txn[cb->coinb1_len+12], cb->coinb2_bin, cb->coinb2_len);\n"
    "\t\t}"
)

patch_file(
    STRATUM_C,
    ASSEMBLY_TARGET,
    ASSEMBLY_REPLACEMENT,
    "coinb2_len_use",
    "datum_stratum.c block assembly personal coinb2_bin",
)

# Replace all remaining cb->coinb1_len+12+cb->coinb2_len with coinb2_len_use
# (covers the double_sha256 calls and assembleBlockAndSubmit).
# Only do this if coinb2_len_use was just introduced (idempotent via the
# already-patched check above means we won't double-replace).
with open(STRATUM_C) as f:
    sc = f.read()
if "cb->coinb1_len+12+cb->coinb2_len" in sc:
    sc = sc.replace("cb->coinb1_len+12+cb->coinb2_len", "cb->coinb1_len+12+coinb2_len_use")
    with open(STRATUM_C, "w") as f:
        f.write(sc)
    print("[datum_stratum.c] Replaced remaining coinb2_len references with coinb2_len_use")


print()
print("All patches applied.  Rebuild datum_gateway:")
print(f"  cd {BUILD_DIR} && make -j$(nproc)")
print("Then restart services:")
print("  systemctl restart reward-unlucky21 datum-gateway-unlucky21")
