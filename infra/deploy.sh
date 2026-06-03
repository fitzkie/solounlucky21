#!/usr/bin/env bash
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: Must run as root" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

mkdir -p /opt/unlucky21

echo "[1/6] Building Go reward service..."
cd "$REPO_ROOT/reward-service"
go mod download
go build -o /opt/unlucky21/reward-service ./cmd/server/
echo "  Built: /opt/unlucky21/reward-service"

echo "[2/6] Installing systemd units..."
for f in bitcoin.service reward-service.service datum-gateway.service; do
    [ -f "$SCRIPT_DIR/$f" ] || { echo "ERROR: $SCRIPT_DIR/$f not found"; exit 1; }
done
cp "$SCRIPT_DIR/bitcoin.service"         /etc/systemd/system/bitcoin-unlucky21.service
cp "$SCRIPT_DIR/reward-service.service"  /etc/systemd/system/reward-unlucky21.service
cp "$SCRIPT_DIR/datum-gateway.service"   /etc/systemd/system/datum-gateway-unlucky21.service

echo "[3/6] Reloading systemd..."
systemctl daemon-reload

echo "[4/6] Enabling services..."
systemctl enable bitcoin-unlucky21 reward-unlucky21 datum-gateway-unlucky21

echo "[5/6] Starting services in order..."
systemctl start bitcoin-unlucky21 || { echo "ERROR: bitcoin-unlucky21 failed to start. Check: journalctl -u bitcoin-unlucky21"; exit 1; }
sleep 5
systemctl start reward-unlucky21 || { echo "ERROR: reward-unlucky21 failed to start. Check: journalctl -u reward-unlucky21"; exit 1; }
sleep 3
systemctl start datum-gateway-unlucky21 || { echo "ERROR: datum-gateway-unlucky21 failed to start. Check: journalctl -u datum-gateway-unlucky21"; exit 1; }

echo "[6/6] Service status:"
systemctl status bitcoin-unlucky21 --no-pager -l | head -5
systemctl status reward-unlucky21  --no-pager -l | head -5
systemctl status datum-gateway-unlucky21 --no-pager -l | head -5

echo ""
echo "Deployment complete. Check logs with:"
echo "  journalctl -u reward-unlucky21 -f"
echo "  journalctl -u datum-gateway-unlucky21 -f"
