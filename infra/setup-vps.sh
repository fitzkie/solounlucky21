#!/usr/bin/env bash
# setup-vps.sh — one-time VPS provisioning for SoloUnlucky21
# Run as root on a fresh Vultr Ubuntu 24.04 LTS instance.
set -euo pipefail

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
    /var/run/unlucky21 \
    /etc/unlucky21 \
    /var/log/unlucky21 \
    /var/lib/unlucky21/bitcoin \
    /opt/unlucky21

chown -R unlucky21:unlucky21 \
    /var/run/unlucky21 \
    /etc/unlucky21 \
    /var/log/unlucky21 \
    /var/lib/unlucky21 \
    /opt/unlucky21

echo "    Directories created and ownership set to unlucky21:unlucky21."

echo "==> [5/6] Configuring UFW firewall..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp   comment 'SSH'
ufw allow 3333/tcp comment 'Stratum V1'
ufw --force enable
ufw status verbose

echo "==> [6/6] Enabling and starting fail2ban..."
systemctl enable fail2ban
systemctl start fail2ban

echo ""
echo "======================================================"
echo "  SoloUnlucky21 VPS provisioning complete."
echo "  SSH (22/tcp) and Stratum (3333/tcp) are open."
echo "  System user 'unlucky21' and all directories ready."
echo "======================================================"
