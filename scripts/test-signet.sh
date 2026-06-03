#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# SoloUnlucky21 — Signet end-to-end integration test harness
# Covers phases 1a–1e from the design spec.
# ---------------------------------------------------------------------------

STRATUM_HOST="${STRATUM_HOST:-127.0.0.1}"
STRATUM_PORT="${STRATUM_PORT:-3333}"
DB_URL="${DB_URL:-postgres://unlucky21:REPLACE@localhost/unlucky21?sslmode=disable}"
BITCOIN_CONF="${BITCOIN_CONF:-/etc/unlucky21/bitcoin.conf}"
TEST_MINER_ADDR_A="${TEST_MINER_ADDR_A:-}"   # must be set by user
TEST_MINER_ADDR_B="${TEST_MINER_ADDR_B:-}"   # must be set by user
MINE_SECONDS="${MINE_SECONDS:-60}"           # how long to run cpuminer per phase

MINER_PID=""
cleanup() {
    [ -n "$MINER_PID" ] && kill "$MINER_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# ---------------------------------------------------------------------------
# Prerequisites
# ---------------------------------------------------------------------------

check_prereqs() {
    echo "[prereqs] Checking required tools..."
    for cmd in cpuminer bitcoin-cli psql nc; do
        command -v "$cmd" >/dev/null 2>&1 || { echo "FAIL: $cmd not found"; exit 1; }
    done

    if [ -z "$TEST_MINER_ADDR_A" ] || [ -z "$TEST_MINER_ADDR_B" ]; then
        echo "FAIL: TEST_MINER_ADDR_A and TEST_MINER_ADDR_B must be set"
        echo "  Example: export TEST_MINER_ADDR_A=bc1qYOURSIGNETADDRESS"
        exit 1
    fi

    echo "[prereqs] Checking Bitcoin Core is running..."
    bitcoin-cli -conf="$BITCOIN_CONF" getblockchaininfo > /dev/null 2>&1 || {
        echo "FAIL: Bitcoin Core not responding"
        exit 1
    }

    echo "[prereqs] All checks passed"
}

# ---------------------------------------------------------------------------
# Phase 1a — Stratum port open
# ---------------------------------------------------------------------------

phase_1a() {
    echo ""
    echo "=== Phase 1a: Stratum port accepting connections ==="
    nc -z "$STRATUM_HOST" "$STRATUM_PORT" && echo "PASS: port $STRATUM_PORT open" || {
        echo "FAIL: port $STRATUM_PORT not open — is datum_gateway running?"
        return 1
    }
}

# ---------------------------------------------------------------------------
# Phase 1b — Shares recorded in database
# ---------------------------------------------------------------------------

phase_1b() {
    echo ""
    echo "=== Phase 1b: Mine for ${MINE_SECONDS}s, verify shares reach database ==="

    cpuminer -a sha256d \
        -o "stratum+tcp://${STRATUM_HOST}:${STRATUM_PORT}" \
        -u "$TEST_MINER_ADDR_A" -p x -t 2 \
        --no-redirect 2>/dev/null &
    MINER_PID=$!

    sleep "$MINE_SECONDS"
    kill "$MINER_PID" 2>/dev/null || true
    wait "$MINER_PID" 2>/dev/null || true

    COUNT=$(psql "$DB_URL" -t -c \
        "SELECT COUNT(*) FROM shares WHERE btc_address='$TEST_MINER_ADDR_A'" \
        | tr -d ' \n')

    [ "${COUNT:-0}" -gt 0 ] && \
        echo "PASS: $COUNT share(s) recorded for miner A" || {
        echo "FAIL: no shares in database for $TEST_MINER_ADDR_A"
        return 1
    }
}

# ---------------------------------------------------------------------------
# Phase 1c — Leaderboard ranking
# ---------------------------------------------------------------------------

phase_1c() {
    echo ""
    echo "=== Phase 1c: Leaderboard ranking query ==="

    ROUND_ID=$(psql "$DB_URL" -t -c \
        "SELECT id FROM rounds WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1" \
        | tr -d ' \n')

    [ -n "$ROUND_ID" ] || { echo "FAIL: no active round found"; return 1; }

    TOP=$(psql "$DB_URL" -t -c "
        SELECT btc_address FROM (
            SELECT btc_address, MAX(share_difficulty) AS best
            FROM shares
            WHERE round_id=$ROUND_ID
              AND submitted_at > NOW() - INTERVAL '7 days'
              AND is_stale = false
            GROUP BY btc_address
            ORDER BY best DESC
            LIMIT 1
        ) t" | tr -d ' \n')

    [ -n "$TOP" ] && echo "PASS: rank #1 is $TOP" || {
        echo "FAIL: leaderboard is empty"
        return 1
    }
}

# ---------------------------------------------------------------------------
# Phase 1d — Block found + reset (manual instruction)
# ---------------------------------------------------------------------------

phase_1d() {
    echo ""
    echo "=== Phase 1d: Block found + leaderboard reset ==="
    echo "NOTE: This phase requires a signet block to be found."
    echo "Run cpuminer and wait for datum_gateway to find a block:"
    echo ""
    echo "  cpuminer -a sha256d -o stratum+tcp://${STRATUM_HOST}:${STRATUM_PORT} \\"
    echo "    -u $TEST_MINER_ADDR_A -p x -t \$(nproc)"
    echo ""
    echo "When a block is found, verify:"
    echo "  1. psql \$DB_URL -c 'SELECT height, hash, finder_address FROM blocks ORDER BY found_at DESC LIMIT 1'"
    echo "  2. The coinbase txid on mempool.space/signet should show 23+ outputs"
    echo "  3. psql \$DB_URL -c 'SELECT id, started_at FROM rounds ORDER BY id DESC LIMIT 3'"
    echo "     A new round should have started after the block"
    echo ""
    echo "SKIP: Automated block-find test (run manually after pool finds its first signet block)"
}

# ---------------------------------------------------------------------------
# Phase 1e — Fallback test
# ---------------------------------------------------------------------------

phase_1e() {
    echo ""
    echo "=== Phase 1e: Go service fallback ==="
    echo "This phase tests datum_gateway's fallback when the Go service is unavailable."
    echo ""
    echo "Manual procedure:"
    echo "  1. Stop the reward service:  systemctl stop reward-unlucky21"
    echo "  2. Mine for 30s:             cpuminer -a sha256d -o stratum+tcp://${STRATUM_HOST}:${STRATUM_PORT} -u $TEST_MINER_ADDR_A -p x -t 1"
    echo "  3. Verify datum_gateway logs show fallback to single-output coinbase"
    echo "  4. Restart reward service:   systemctl start reward-unlucky21"
    echo "  5. Verify service reconnects: systemctl status reward-unlucky21"
    echo ""
    echo "SKIP: Automated fallback test (run manually)"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

main() {
    echo "=== SoloUnlucky21 Signet Integration Test ==="
    echo "Stratum: ${STRATUM_HOST}:${STRATUM_PORT}"
    echo "DB: ${DB_URL//:*@/:**@}"   # redact password
    echo ""

    check_prereqs
    phase_1a
    phase_1b
    phase_1c
    phase_1d
    phase_1e

    echo ""
    echo "=== Automated phases complete ==="
    echo "Phase 1a (stratum):     PASS"
    echo "Phase 1b (shares):      PASS"
    echo "Phase 1c (leaderboard): PASS"
    echo "Phase 1d (block found): MANUAL"
    echo "Phase 1e (fallback):    MANUAL"
}

main "$@"
