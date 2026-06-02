#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="/opt/datum-gateway"
BUILD_DIR="$INSTALL_DIR/build"

echo "[1/3] Installing build deps..."
apt-get install -y build-essential cmake pkg-config libssl-dev \
  libcurl4-openssl-dev libjansson-dev libcjson-dev 2>/dev/null || true

echo "[2/3] Building datum_gateway..."
mkdir -p "$BUILD_DIR"
cd "$BUILD_DIR"
cmake .. -DCMAKE_BUILD_TYPE=Release -DCMAKE_C_FLAGS="-Wall -Wextra"
make -j"$(nproc)"

echo "[3/3] Installing binary..."
install -m 0755 datum_gateway /usr/local/bin/datum_gateway

echo "datum_gateway built and installed to /usr/local/bin/datum_gateway"
datum_gateway --version 2>/dev/null || echo "(no --version flag, binary is present)"
