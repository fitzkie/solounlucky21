# SoloUnlucky21 — datum_gateway Integration Guide

This document tells you exactly how to wire `datum_reward_socket.c` into the
`datum_gateway` source tree after you clone it on the VPS.  Follow every step
in order.  Steps 1–4 are one-time setup; Step 5 is an end-to-end smoke test.

---

## Prerequisites

- You have cloned the OCEAN datum_gateway repository into `/opt/datum-gateway/`.
- You have already built the reward-service binary (see `reward-service/README.md`).
- The SoloUnlucky21 support files are in `/opt/datum-gateway/src/`:
  - `src/datum_reward_socket.h`
  - `src/datum_reward_socket.c`

If those files are not present, copy them from the solounlucky21 repo:

```bash
cp /opt/solounlucky21/datum-gateway/src/datum_reward_socket.h \
   /opt/datum-gateway/src/
cp /opt/solounlucky21/datum-gateway/src/datum_reward_socket.c \
   /opt/datum-gateway/src/
```

---

## Step 1: Add datum_reward_socket.c to CMakeLists.txt

First, locate the source-file list in CMakeLists.txt:

```bash
grep -n "add_executable\|target_sources\|\.c\"" /opt/datum-gateway/CMakeLists.txt | head -40
```

You will see something like one of these two patterns.

**Pattern A — `add_executable` with an inline file list:**

```cmake
add_executable(datum_gateway
    src/datum_bitcoin.c
    src/datum_conf.c
    src/datum_stratum.c
    ...
)
```

**Pattern B — `target_sources` added after `add_executable`:**

```cmake
add_executable(datum_gateway "")
target_sources(datum_gateway PRIVATE
    src/datum_bitcoin.c
    src/datum_conf.c
    ...
)
```

For whichever pattern applies, add `src/datum_reward_socket.c` to the list.
The diff will look like this (Pattern A shown; adapt for Pattern B):

```diff
 add_executable(datum_gateway
     src/datum_bitcoin.c
     src/datum_conf.c
     src/datum_stratum.c
+    src/datum_reward_socket.c
 )
```

Apply the edit:

```bash
# Verify the line you will insert after — replace datum_stratum.c with whatever
# the last .c file in the list actually is:
grep -n "datum_stratum\|datum_conf\|datum_bitcoin" /opt/datum-gateway/CMakeLists.txt
```

Then open CMakeLists.txt in your editor and add the line.  Confirm:

```bash
grep "datum_reward_socket" /opt/datum-gateway/CMakeLists.txt
# Expected output:
#     src/datum_reward_socket.c
```

---

## Step 2: Find the coinbase construction hook point

Run the following commands to identify which source files handle coinbase /
generation-transaction construction:

```bash
grep -rn "coinbase\|gen_tx\|generation\|payout\|output_count\|vout" \
    /opt/datum-gateway/src/ --include="*.c" -l
```

Then drill into the most likely file (usually `datum_bitcoin.c`):

```bash
grep -n "coinbase\|p2wpkh\|p2pkh\|scriptPubKey\|output.*addr\|addr.*output" \
    /opt/datum-gateway/src/datum_bitcoin.c 2>/dev/null || \
  grep -rn "coinbase\|p2wpkh\|p2pkh" \
    /opt/datum-gateway/src/ --include="*.c" | head -20
```

You are looking for a function that:

1. Receives a block template and (optionally) a miner's BTC address.
2. Builds the coinbase transaction output(s).
3. Contains a loop or direct call that writes the recipient address and amount.

Common function names: `datum_build_coinbase`, `create_coinbase_tx`,
`build_generation_tx`, `make_gen_tx`.

Once you find the function, look for the variable names that hold the miner's
address and the total block fees.  Common names:

| What you need         | Common variable/field names                                         |
|-----------------------|---------------------------------------------------------------------|
| Miner BTC address     | `worker->address`, `work->coinbase_address`, `client->btc_addr`     |
| Block fees in sats    | `template->fees`, `work->fees_sats`, `bt->fees`, `coinbase_value`   |
| Output construction   | `add_output(addr, sats)`, `append_vout(...)`, manual buffer writes  |

Note down the exact variable names — you will need them in Step 3.

---

## Step 3: Inject the hook

The hook goes **immediately before** the existing output construction loop (or
the first `add_output`/`append_vout` call) inside the coinbase-building
function.

Add a `#include` at the top of the file if it is not already there:

```diff
+#include "datum_reward_socket.h"
```

Then insert the following block just before the output construction:

```c
/* ---- BEGIN unlucky21 reward hook ---- */
reward_output_list_t unlucky21_outputs;
int use_unlucky21_outputs = 0;

/* Replace MINER_ADDR_FIELD with the actual field found in Step 2.
 * Examples: worker->address, work->coinbase_address, client->btc_addr */
const char *miner_btc_address = MINER_ADDR_FIELD;

/* Replace FEES_SATS_FIELD with the actual field found in Step 2.
 * Examples: template->fees, work->fees_sats, bt->fees, coinbase_value */
int64_t block_fees_sats = FEES_SATS_FIELD;

if (datum_request_coinbase_outputs(miner_btc_address, block_fees_sats,
                                   &unlucky21_outputs) > 0) {
    use_unlucky21_outputs = 1;
}
/* ---- END unlucky21 reward hook ---- */
```

Then wrap the existing output construction block:

```c
if (use_unlucky21_outputs) {
    /*
     * Replace the existing output construction loop with this.
     * Replace ADD_COINBASE_OUTPUT with the actual function or macro
     * used by datum_gateway to append a coinbase output.
     * Pass: address string and amount in satoshis.
     *
     * Special case: if amount_sats == -1 the reward service is signalling
     * "give the full block reward to this address" (solo fallback for a
     * miner who is not in the pool roster).  In that case pass the full
     * coinbase_value (subsidy + fees) for this output.
     */
    for (int i = 0; i < unlucky21_outputs.count; i++) {
        int64_t sats = unlucky21_outputs.outputs[i].amount_sats;
        if (sats == -1) {
            sats = FULL_BLOCK_REWARD_FIELD; /* subsidy + fees */
        }
        ADD_COINBASE_OUTPUT(
            unlucky21_outputs.outputs[i].address,
            sats
        );
    }
} else {
    /*
     * Go reward service unavailable — fall through to datum_gateway's
     * existing single-output coinbase code.  No modification needed;
     * just leave the original code in this else branch.
     */
    /* ... original output construction code stays here ... */
}
```

**Placeholders to replace before compiling:**

| Placeholder              | Replace with                                                     |
|--------------------------|------------------------------------------------------------------|
| `MINER_ADDR_FIELD`       | The C expression for the miner's BTC address string             |
| `FEES_SATS_FIELD`        | The C expression for block fees in satoshis                     |
| `ADD_COINBASE_OUTPUT`    | The function/macro that appends one output to the coinbase tx   |
| `FULL_BLOCK_REWARD_FIELD`| The C expression for subsidy + fees (used for -1 fallback)      |

---

## Step 4: Rebuild

```bash
cd /opt/datum-gateway/build
make -j$(nproc)
```

If the build fails with a missing symbol, confirm that `datum_reward_socket.c`
was added to CMakeLists.txt (Step 1) and that you re-ran CMake if needed:

```bash
cmake .. && make -j$(nproc)
```

---

## Step 5: Test the hook (before connecting real miners)

Open three terminals (or use tmux/screen).

**Terminal 1 — start the reward service:**

```bash
DATABASE_URL="postgres://unlucky21:PASSWORD@localhost/unlucky21" \
    /opt/unlucky21/reward-service
```

**Terminal 2 — start datum_gateway:**

```bash
/opt/datum-gateway/build/datum_gateway \
    --config /etc/unlucky21/datum-gateway.conf
```

**Terminal 3 — connect a test miner:**

```bash
cpuminer -a sha256d \
         -o stratum+tcp://127.0.0.1:3333 \
         -u YOUR_BTC_ADDRESS \
         -p x \
         -t 1
```

Watch the reward-service logs for socket activity:

```
GetCoinbaseOutputs called  miner=YOUR_BTC_ADDRESS fees=...
```

If you see that line the hook is working.  If datum_gateway falls back to
single-output coinbase (reward service not reachable), no miners are disrupted —
verify the socket path `/var/run/unlucky21/reward.sock` exists and that the
reward-service process is running.

---

## Quick-reference: key constants

| Constant              | Value                              | Defined in                  |
|-----------------------|------------------------------------|-----------------------------|
| `REWARD_SOCKET_PATH`  | `/var/run/unlucky21/reward.sock`   | `datum_reward_socket.h`     |
| `REWARD_MAX_OUTPUTS`  | 30                                 | `datum_reward_socket.h`     |
| `REWARD_ADDR_LEN`     | 91 bytes (covers Taproot/bech32m)  | `datum_reward_socket.h`     |
| Socket timeout        | 500 ms send + 500 ms recv          | `datum_reward_socket.c`     |

The 500 ms timeout means that if the Go service is slow or down, datum_gateway
stalls for at most 1 second per template before falling back.  This is
acceptable for solo mining where templates are built once per new block.
