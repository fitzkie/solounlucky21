# datum-gateway

Fork of OCEAN-xyz/datum_gateway modified for SoloUnlucky21's top-21 coinbase reward model.

## What's changed from upstream
- Added `src/datum_reward_socket.h` and `src/datum_reward_socket.c` — Unix socket client that calls the Go reward service for per-miner coinbase outputs
- Modified coinbase construction to use dynamic per-miner output list from Go service
- Falls back to single-output (solo) coinbase if Go service is unavailable

## Setup on VPS

### 1. Fork on GitHub
Go to https://github.com/OCEAN-xyz/datum_gateway and fork to your GitHub account.
Name it `datum-gateway`.

### 2. Add as git submodule
From the solounlucky21 repo root:
```
git submodule add git@github.com:YOUR_GITHUB_USERNAME/datum-gateway.git datum-gateway
git submodule update --init --recursive
```

### 3. Install build dependencies (Ubuntu 24.04)
```
apt-get install -y build-essential cmake pkg-config libssl-dev \
  libcurl4-openssl-dev libjansson-dev
```

### 4. Build
```
cd /opt/datum-gateway
mkdir -p build && cd build
cmake .. -DCMAKE_BUILD_TYPE=Release
make -j$(nproc)
```
Expected: `datum_gateway` binary produced.

### 5. Find the coinbase hook point
After cloning, identify where datum_gateway constructs coinbase outputs:
```
grep -rn "coinbase\|gen_tx\|payout\|output\|scriptPubKey\|p2wpkh\|p2pkh" src/ \
  --include="*.c" --include="*.h" -l
```
Then inspect the most relevant file to find the function that sets coinbase outputs.
Record the function name for Task 11.

### 6. Configure
Copy `datum-gateway.conf.example` (or the upstream config) and set:
- `bitcoind_rpc_url`: `http://127.0.0.1:18443`
- `bitcoind_rpc_username`: `unlucky21rpc`
- `bitcoind_rpc_password`: your bitcoin.conf password
- `stratum_port`: `3333`

### 7. First run (without custom hook)
```
./datum_gateway --config /etc/unlucky21/datum-gateway.conf
```
Verify it connects to Bitcoin Core and opens Stratum port 3333.

## Files modified from upstream
- `src/datum_reward_socket.h` — added (Task 10)
- `src/datum_reward_socket.c` — added (Task 10)
- `src/<hook_file>.c` — modified (Task 11, file TBD after source inspection)
- `CMakeLists.txt` — add datum_reward_socket.c to sources (Task 11)
