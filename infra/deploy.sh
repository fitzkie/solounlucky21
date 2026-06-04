#!/usr/bin/env bash
# deploy.sh — Update unlucky21 on the VPS from GitHub
#
# Usage:
#   ./infra/deploy.sh            # update everything
#   ./infra/deploy.sh --check    # compare VPS vs GitHub (no changes)
#
# Run from any machine that can SSH to the VPS, OR run directly on the VPS
# as root from within /opt/unlucky21-repo after a git pull.
set -euo pipefail

REPO_URL="https://github.com/fitzkie/unlucky21.git"
REPO_DIR="/opt/unlucky21-repo"
DATUM_SRC="/opt/datum-gateway/src"
DATUM_BUILD="/opt/datum-gateway/build"
BINARY_DIR="/opt/unlucky21"
GO_BIN="/usr/local/go/bin/go"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root" >&2; exit 1
fi

CHECK_ONLY=false
[[ "${1:-}" == "--check" ]] && CHECK_ONLY=true

# ─── 1. Clone or pull the unlucky21 repo ─────────────────────────────────────
echo "=== [1] Syncing repo from GitHub ==="
if [ -d "$REPO_DIR/.git" ]; then
  cd "$REPO_DIR"
  git fetch origin
  BEHIND=$(git rev-list HEAD..origin/main --count 2>/dev/null || echo "?")
  echo "  $BEHIND commit(s) behind origin/main"
  if $CHECK_ONLY; then
    git diff HEAD origin/main --stat
    echo "--- VPS custom C files vs repo ---"
    diff "$DATUM_SRC/datum_coinbaser.c"     "$REPO_DIR/datum-gateway/src/datum_coinbaser.c"     && echo "datum_coinbaser.c: MATCH" || echo "datum_coinbaser.c: DIFFERS"
    diff "$DATUM_SRC/datum_reward_socket.c" "$REPO_DIR/datum-gateway/src/datum_reward_socket.c" && echo "datum_reward_socket.c: MATCH" || echo "datum_reward_socket.c: DIFFERS"
    diff "$DATUM_SRC/datum_reward_socket.h" "$REPO_DIR/datum-gateway/src/datum_reward_socket.h" && echo "datum_reward_socket.h: MATCH" || echo "datum_reward_socket.h: DIFFERS"
    diff "$DATUM_SRC/datum_blocktemplates.c" "$REPO_DIR/datum-gateway/src/datum_blocktemplates.c" && echo "datum_blocktemplates.c: MATCH" || echo "datum_blocktemplates.c: DIFFERS"
    echo "--- Reward service builder ---"
    diff "/opt/solounlucky21/reward-service/internal/coinbase/builder.go" \
         "$REPO_DIR/reward-service/internal/coinbase/builder.go" && echo "builder.go: MATCH" || echo "builder.go: DIFFERS"
    exit 0
  fi
  git pull origin main
else
  git clone "$REPO_URL" "$REPO_DIR"
  cd "$REPO_DIR"
fi
echo "  Repo at: $(git log --oneline -1)"

# ─── 2. Copy custom C files into datum_gateway ───────────────────────────────
echo "=== [2] Updating datum_gateway C sources ==="
for f in datum_coinbaser.c datum_reward_socket.c datum_reward_socket.h datum_blocktemplates.c datum_reward_socket_example.c; do
  if [ -f "$REPO_DIR/datum-gateway/src/$f" ]; then
    cp "$REPO_DIR/datum-gateway/src/$f" "$DATUM_SRC/$f"
    echo "  Copied: $f"
  fi
done

# ─── 3. Rebuild datum_gateway ─────────────────────────────────────────────────
echo "=== [3] Building datum_gateway ==="
systemctl stop datum-gateway-unlucky21 datum-gateway-rental 2>/dev/null || true
sleep 2
cd "$DATUM_BUILD"
make -j"$(nproc)" 2>&1 | tail -5
cp datum_gateway /usr/local/bin/datum_gateway
echo "  Installed: /usr/local/bin/datum_gateway ($(date -r /usr/local/bin/datum_gateway '+%Y-%m-%d %H:%M'))"

# ─── 4. Rebuild reward service ────────────────────────────────────────────────
echo "=== [4] Building reward service ==="
# Copy updated Go sources
cp -r "$REPO_DIR/reward-service/." /opt/solounlucky21/reward-service/
cd /opt/solounlucky21/reward-service
export PATH="$PATH:/usr/local/go/bin"
go build -o "$BINARY_DIR/reward-service" ./cmd/server/
echo "  Installed: $BINARY_DIR/reward-service"

# ─── 5. Copy infra files ──────────────────────────────────────────────────────
echo "=== [5] Updating system files ==="
cp "$REPO_DIR/infra/signet-signer.py" "$BINARY_DIR/signet-signer.py"
for unit in bitcoin reward-service datum-gateway signet-signer; do
  src=$(ls "$REPO_DIR/infra/${unit}".service 2>/dev/null || true)
  [ -z "$src" ] && continue
  dst_name=$(basename "$src" | sed 's/bitcoin/bitcoin-unlucky21/;s/reward-service/reward-unlucky21/;s/datum-gateway/datum-gateway-unlucky21/;s/signet-signer/signet-signer/')
  cp "$src" "/etc/systemd/system/$dst_name"
  echo "  Updated: $dst_name"
done
systemctl daemon-reload

# ─── 6. Restart services ─────────────────────────────────────────────────────
echo "=== [6] Restarting services ==="
systemctl restart reward-unlucky21
sleep 2
systemctl start datum-gateway-unlucky21
sleep 3
echo ""
echo "Status:"
for svc in bitcoin-unlucky21 reward-unlucky21 datum-gateway-unlucky21; do
  state=$(systemctl is-active "$svc" 2>/dev/null || echo "unknown")
  echo "  $svc: $state"
done

echo ""
echo "Done. Git commit deployed: $(cd $REPO_DIR && git log --oneline -1)"
echo "Compare anytime: $0 --check"
