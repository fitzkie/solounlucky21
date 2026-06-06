#!/usr/bin/env bash
# setup-mainnet-vps.sh — one-time provisioning for the Unlucky21 mainnet server
# Run as root on a fresh Vultr Ubuntu 24.04 LTS instance.
#
# Differences from setup-vps.sh (signet):
#   - Opens Bitcoin P2P port 8333 for mainnet peer discovery
#   - No signet-specific seed nodes
#   - PostgreSQL external access on 5432 (same as signet setup — do manually
#     after running this script; see AFTER THIS SCRIPT section at the bottom)
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: This script must be run as root" >&2
  exit 1
fi

echo "==> [1/6] Updating system packages..."
apt-get update -y
apt-get upgrade -y

echo "==> [2/6] Installing system dependencies..."
apt-get install -y \
    build-essential \
    git \
    cmake \
    pkg-config \
    libssl-dev \
    libcurl4-openssl-dev \
    libevent-dev \
    libzmq3-dev \
    libjansson-dev \
    postgresql-16 \
    postgresql-client-16 \
    ufw \
    fail2ban \
    curl \
    wget \
    jq \
    autoconf

echo "==> [3/6] Creating system user 'unlucky21'..."
if id unlucky21 &>/dev/null; then
    echo "    User 'unlucky21' already exists, skipping."
else
    useradd --system --no-create-home --shell /usr/sbin/nologin unlucky21
    echo "    User 'unlucky21' created."
fi

echo "==> [4/6] Creating application directories..."
mkdir -p \
    /etc/unlucky21 \
    /var/log/unlucky21 \
    /var/lib/unlucky21/bitcoin \
    /opt/unlucky21

chown root:unlucky21 /etc/unlucky21
chmod 750 /etc/unlucky21

chown -R unlucky21:unlucky21 \
    /var/log/unlucky21 \
    /var/lib/unlucky21 \
    /opt/unlucky21

echo "    Directories created and ownership set."

echo "==> [5/6] Configuring UFW firewall..."
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp    comment 'SSH'
ufw allow 3333/tcp  comment 'Stratum V1'
ufw allow 8333/tcp  comment 'Bitcoin mainnet P2P'
ufw allow 5432/tcp  comment 'PostgreSQL external read-only'
ufw --force enable
ufw status verbose

echo "==> [6/6] Enabling and starting fail2ban..."
systemctl enable fail2ban
systemctl start fail2ban

cat > /etc/fail2ban/jail.local <<'EOF'
[sshd]
enabled = true
maxretry = 5
bantime = 3600
EOF
systemctl restart fail2ban

cat <<'DONE'

======================================================
  Unlucky21 mainnet VPS provisioning complete.

  NEXT STEPS (manual — do these before starting IBD):

  1. Install Bitcoin Core:
       See infra/install-bitcoin-core.sh or follow
       https://bitcoin.org/en/download

  2. Copy mainnet config:
       scp infra/bitcoin-mainnet.conf root@<IP>:/etc/unlucky21/bitcoin.conf
       # Edit the file and replace rpcpassword with: openssl rand -hex 32

  3. Install and enable the systemd unit:
       scp infra/bitcoin-mainnet.service root@<IP>:/etc/systemd/system/bitcoin-unlucky21.service
       systemctl daemon-reload
       systemctl enable bitcoin-unlucky21
       systemctl start bitcoin-unlucky21

  4. Watch IBD progress (takes 2-5 days):
       bitcoin-cli -conf=/etc/unlucky21/bitcoin.conf getblockchaininfo | jq '.verificationprogress'

  5. Configure PostgreSQL for Railway access:
       Same steps as signet server (listen_addresses, pg_hba.conf hostssl,
       create unlucky21_web user, run schema.sql).
       See existing signet server for reference.

  6. AFTER IBD completes: install datum_gateway and reward service,
     then update DNS and Railway DATABASE_URL.

======================================================
DONE
