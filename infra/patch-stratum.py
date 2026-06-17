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


# ─── 0. datum_stratum.c: add #include "datum_reward_socket.h" ────────────────
# datum_stratum.c uses REWARD_ADDR_LEN which is defined in datum_reward_socket.h.
# The upstream CMakeLists.txt doesn't include this, so we patch it in.

with open(STRATUM_C) as f:
    sc0 = f.read()

if '"datum_reward_socket.h"' in sc0:
    print("[datum_stratum.c include] Already patched — skipping")
else:
    sc0 = sc0.replace(
        '#include "datum_coinbaser.h"',
        '#include "datum_coinbaser.h"\n#include "datum_reward_socket.h"',
        1,
    )
    with open(STRATUM_C, "w") as f:
        f.write(sc0)
    print("[datum_stratum.c include] Added #include datum_reward_socket.h")


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
#
# v2: adds _personal_cb2_new flag so that when personal coinb2 is first built
# for a job, clean_jobs=true is forced — preventing a merkle-root mismatch
# caused by the miner mining against the shared coinb2 while datum_gateway
# assembles the block with the personal coinb2.
COINB2_SEND_TARGET = "\tdatum_socket_send_string_to_client(c, cb->coinb2);"

# If the old v1 patch (without _personal_cb2_new) is already applied, upgrade it.
COINB2_SEND_TARGET_V1 = (
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

COINB2_SEND_REPLACEMENT = (
    "\t/* Unlucky21: use per-miner personalized coinb2 (finder slot = miner address) */\n"
    "\t/* v2: _personal_cb2_new forces clean_jobs=true on first build to prevent */\n"
    "\t/* merkle-root mismatch when miner was mining against the shared coinb2.   */\n"
    "\tbool _personal_cb2_new = false;\n"
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
    "\t\t\t\tif (m->personal_coinb2_valid) _personal_cb2_new = true;\n"
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

with open(STRATUM_C) as f:
    sc_tmp = f.read()

if "_personal_cb2_new" in sc_tmp:
    print("[datum_stratum.c send_mining_notify personal coinb2] Already at v2 — skipping")
elif COINB2_SEND_TARGET_V1 in sc_tmp:
    # Upgrade v1 → v2
    sc_tmp = sc_tmp.replace(COINB2_SEND_TARGET_V1, COINB2_SEND_REPLACEMENT, 1)
    with open(STRATUM_C, "w") as f:
        f.write(sc_tmp)
    print("[datum_stratum.c send_mining_notify personal coinb2] Upgraded v1 → v2 (clean_jobs fix)")
elif COINB2_SEND_TARGET in sc_tmp:
    sc_tmp = sc_tmp.replace(COINB2_SEND_TARGET, COINB2_SEND_REPLACEMENT, 1)
    with open(STRATUM_C, "w") as f:
        f.write(sc_tmp)
    print("[datum_stratum.c send_mining_notify personal coinb2] Patched (v2)")
else:
    print(f"ERROR: Could not find coinb2 send target in {STRATUM_C}")
    import sys; sys.exit(1)


# ─── 3b. datum_stratum.c: force clean_jobs=true when personal coinb2 is new ──
# When _personal_cb2_new=true, the miner must restart work against the
# personal coinb2.  Without this, the miner could submit a block found
# against the old shared coinb2 while we assemble with personal coinb2,
# causing a merkle-root mismatch and silent block rejection.

CLEAN_JOBS_TARGET = (
    "\tif ((clean) || (quickdiff) || (new_block)) {\n"
    "\t\tdatum_socket_send_string_to_client(c, \"true]}\\" + "n\");\n"
    "\t} else {\n"
    "\t\tdatum_socket_send_string_to_client(c, \"false]}\\" + "n\");\n"
    "\t}\n"
)

CLEAN_JOBS_REPLACEMENT = (
    "\tif ((clean) || (quickdiff) || (new_block) || _personal_cb2_new) {\n"
    "\t\tdatum_socket_send_string_to_client(c, \"true]}\\" + "n\");\n"
    "\t} else {\n"
    "\t\tdatum_socket_send_string_to_client(c, \"false]}\\" + "n\");\n"
    "\t}\n"
)

patch_file(
    STRATUM_C,
    CLEAN_JOBS_TARGET,
    CLEAN_JOBS_REPLACEMENT,
    "_personal_cb2_new) {",
    "datum_stratum.c clean_jobs force on personal coinb2 build",
)


# ─── 4. datum_stratum.c: block assembly — use personal coinb2_bin ────────────
# Replace the three-line memcpy block that builds full_cb_txn with a version
# that substitutes the personal coinb2_bin when valid.  Introduce coinb2_len_use
# to carry the correct length through the SHA256 and assembleBlockAndSubmit calls.

ASSEMBLY_TARGET = (
    "\tmemcpy(&full_cb_txn[0], cb->coinb1_bin, cb->coinb1_len);\n"
    "\tmemcpy(&full_cb_txn[cb->coinb1_len], extranonce_bin, 12);\n"
    "\tmemcpy(&full_cb_txn[cb->coinb1_len+12], cb->coinb2_bin, cb->coinb2_len);"
)

ASSEMBLY_REPLACEMENT = (
    "\tmemcpy(&full_cb_txn[0], cb->coinb1_bin, cb->coinb1_len);\n"
    "\tmemcpy(&full_cb_txn[cb->coinb1_len], extranonce_bin, 12);\n"
    "\t/* Unlucky21: use personal coinb2 so the finder slot matches what was sent to the miner */\n"
    "\tint coinb2_len_use = cb->coinb2_len;\n"
    "\tif (!empty_work && m->personal_coinb2_valid &&\n"
    "\t\t\tm->personal_coinb2_job_index == job->global_index) {\n"
    "\t\tmemcpy(&full_cb_txn[cb->coinb1_len+12],\n"
    "\t\t\tm->personal_coinb2_bin, m->personal_coinb2_len);\n"
    "\t\tcoinb2_len_use = m->personal_coinb2_len;\n"
    "\t} else {\n"
    "\t\tmemcpy(&full_cb_txn[cb->coinb1_len+12], cb->coinb2_bin, cb->coinb2_len);\n"
    "\t}"
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


# ─── 5. datum_stratum.c: call datum_reward_share_submit on every accepted share ─
# datum_reward_share_submit() is defined in datum_reward_socket.c but was never
# wired into the share-acceptance path.  Insert it after the "accepted" JSON
# is sent to the miner so every validated share (datum or solo) is recorded in
# the Unlucky21 PostgreSQL database via the reward-service Unix socket.
#
# The target is uniquely identified by the send_string call followed by
# "// update connection totals" — the auth-accept path that looks similar
# is followed by "m->authorized = true" instead.

with open(STRATUM_C) as f:
    sc5 = f.read()

if "datum_reward_share_submit(username_s" in sc5:
    print("[datum_stratum.c share submit] Already patched — skipping")
else:
    # Match uniquely: accepted-share send followed by connection-totals comment.
    # The blank line between them contains a tab (\t\n) in the upstream source.
    _t5 = (
        "datum_socket_send_string_to_client(c, s);\n"
        "\t\n"
        "\t// update connection totals\n"
        "\tm->share_diff_accepted += job_diff;\n"
        "\tm->share_count_accepted++;"
    )
    # Fallback: blank line may be bare \n on some versions
    _t5_alt = _t5.replace("\t\n", "\n")

    _r5 = (
        "datum_socket_send_string_to_client(c, s);\n"
        "\n"
        "\t/* Unlucky21: record every accepted share in reward-service DB */\n"
        "\tdatum_reward_share_submit(username_s, job_diff, 0);\n"
        "\t\n"
        "\t// update connection totals\n"
        "\tm->share_diff_accepted += job_diff;\n"
        "\tm->share_count_accepted++;"
    )

    if _t5 in sc5:
        sc5 = sc5.replace(_t5, _r5, 1)
    elif _t5_alt in sc5:
        sc5 = sc5.replace(_t5_alt, _r5.replace("\t\n", "\n"), 1)
    else:
        print(f"ERROR: share-submit target not found in {STRATUM_C}")
        sys.exit(1)

    with open(STRATUM_C, "w") as f:
        f.write(sc5)
    print("[datum_stratum.c share submit] Patched — datum_reward_share_submit wired in")


print()
print("All patches applied.  Rebuild datum_gateway:")
print(f"  cd {BUILD_DIR} && make -j$(nproc)")
print("Then restart services:")
print("  systemctl restart reward-unlucky21 datum-gateway-unlucky21")
