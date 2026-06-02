# SoloUnlucky21 — Phase 1: Pool Core + Reward Engine
**Design Spec** · 2026-06-02

---

## 1. Project Context

SoloUnlucky21 (`www.solounlucky21.com`) is a Bitcoin-only solo mining pool with a unique coinbase reward model. Every block found by the pool pays out to:

- The **block finder** (any connected miner whose share triggered the block): fixed 0.50 BTC
- The **top 21 ranked miners** (by rolling 7-day best share): split of remaining reward minus pool fee
- The **pool fee address**: 2% of total block reward

All rewards are paid directly in the coinbase transaction. The pool holds no custody of miner funds at any point.

Tagline: *"Don't find the block. Make the list."*
Stratum endpoint: `stratum+tcp://bitcoin.solounlucky21.com:3333`

---

## 2. Phase 1 Scope

Phase 1 covers the two tightly-coupled backend systems required before any other work:

1. **Pool Core** — datum_gateway (C) as the Stratum V1 server + Bitcoin Core as the node
2. **Reward Engine** — Go service owning all business logic: share ingestion, rolling leaderboard, coinbase output assembly

Phase 1 does **not** include:
- Web dashboard (Phase 2)
- Monitoring stack (Phase 3)
- Mainnet launch (after Phase 1 passes full signet test suite)

---

## 3. Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  VPS — Ubuntu 24.04 LTS                 │
│               Hetzner CX31 (4 vCPU / 8 GB)             │
│                                                         │
│  ┌──────────────┐     RPC      ┌────────────────────┐  │
│  │ Bitcoin Core │◄────────────►│  datum_gateway (C) │  │
│  │   (signet)   │              │  Stratum V1 server  │  │
│  └──────────────┘              └─────────┬──────────┘  │
│                                          │              │
│                              Unix socket │              │
│                     /var/run/unlucky21/  │              │
│                              reward.sock │              │
│                                          ▼              │
│                               ┌─────────────────────┐  │
│                               │   Go Reward Service  │  │
│                               │  - Share ingestion   │  │
│                               │  - 7-day ranking     │  │
│                               │  - Leaderboard cache │  │
│                               │  - Coinbase outputs  │  │
│                               │  - Block-found reset │  │
│                               └──────────┬──────────┘  │
│                                          │              │
│                               ┌──────────▼──────────┐  │
│                               │      PostgreSQL      │  │
│                               │  shares / rounds     │  │
│                               │  blocks / workers    │  │
│                               └─────────────────────┘  │
│                                                         │
│  Miners ──► stratum+tcp://signet.solounlucky21.com:3333 │
└─────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Single responsibility |
|---|---|
| Bitcoin Core (signet) | Provides block templates via RPC; validates and accepts submitted blocks |
| datum_gateway (C) | Accepts Stratum V1 miner connections; requests coinbase outputs from Go service per miner; assembles personalized block templates; submits found blocks |
| Go Reward Service | All business logic — share recording, rolling 7-day ranking, leaderboard state, coinbase output list construction, block-found round reset |
| PostgreSQL | Durable store for shares, rounds, blocks, workers |
| Unix socket | Only seam between C and Go — datum_gateway requests outputs, Go responds with an ordered list |

### The C Modification (Surface Area)

datum_gateway requires one surgical hook: when building a block template for a specific miner, call the Unix socket with the miner's BTC address, receive an ordered coinbase output list, encode it into the template. Approximately 80 lines of C. No other changes to datum_gateway.

---

## 4. Data Model

### `rounds`
```sql
id          bigserial    PRIMARY KEY
started_at  timestamptz  NOT NULL
ended_at    timestamptz              -- NULL = current active round
block_id    bigint       REFERENCES blocks(id)
```

### `shares`
```sql
id                bigserial     PRIMARY KEY
round_id          bigint        NOT NULL REFERENCES rounds(id)
btc_address       varchar(90)   NOT NULL
worker_name       varchar(64)
share_difficulty  numeric(78,0) NOT NULL   -- full 256-bit safe; use *big.Int in Go
submitted_at      timestamptz   NOT NULL DEFAULT now()
is_stale          boolean       NOT NULL DEFAULT false

INDEX (btc_address, submitted_at)   -- drives 7-day ranking query
INDEX (round_id)                    -- drives per-round queries
```

`numeric(78,0)` covers the full 256-bit range. Share difficulty is handled as `*big.Int` in the Go service to avoid uint64 overflow at high ASIC hashrates.

### `blocks`
```sql
id               bigserial    PRIMARY KEY
round_id         bigint       NOT NULL REFERENCES rounds(id)
height           integer      NOT NULL
hash             varchar(64)  NOT NULL
found_at         timestamptz  NOT NULL
finder_address   varchar(90)  NOT NULL
coinbase_txid    varchar(64)
top_21_snapshot  jsonb        NOT NULL  -- [{rank, address, amount_sats}, ...]
block_fees_sats  bigint                 -- transaction fees in this block
```

### `workers`
```sql
btc_address   varchar(90)   NOT NULL
worker_name   varchar(64)   NOT NULL
last_seen     timestamptz   NOT NULL
hashrate_th   numeric(10,2)
PRIMARY KEY (btc_address, worker_name)
```

### Leaderboard (query — no separate table)
```sql
SELECT
  btc_address,
  MAX(share_difficulty)  AS best_share,
  MAX(submitted_at)      AS last_activity,
  RANK() OVER (ORDER BY MAX(share_difficulty) DESC) AS rank
FROM shares
WHERE round_id = <current_round_id>
  AND submitted_at > NOW() - INTERVAL '7 days'
  AND is_stale = false
GROUP BY btc_address
ORDER BY best_share DESC
```

The Go service caches the result in memory and refreshes every 10 seconds. No Redis required in Phase 1.

---

## 5. Ranking Model

- **Rank** = single highest-difficulty share submitted by an address in the **current round** AND within the last **7 rolling days**
- **Reset** = when the pool finds a block, the current round closes, a new round opens, the leaderboard is empty again
- **7-day window** = if a round runs longer than 7 days (possible for a small pool), miners who stop mining age off the leaderboard and must resubmit to reclaim their slot
- **Multiple workers** = all workers under the same BTC address share one leaderboard entry; best share from any worker counts

---

## 6. Coinbase Construction

### Payout Math

Block reward = `subsidy_sats + fees_sats` (dynamic — fees included)

| Slot | Recipient | Amount |
|---|---|---|
| 1 | Finder (requesting miner) | 50,000,000 sats (fixed 0.50 BTC) |
| 2–22 | Top 21 ranked addresses | `(total - finder - pool_fee) / 21` each |
| 23 | Pool fee address | `floor(total × 0.02)` + dust remainder |
| 24 | OP_RETURN witness commitment | 0 sats — mandatory for SegWit blocks |
| 25 | OP_RETURN pool ID (optional) | 0 sats |

**Exact payout formula:**
```
pool_fee_base = floor(total × 0.02)
per_slot      = floor((total - finder - pool_fee_base) / 21)
dust          = (total - finder - pool_fee_base) - (per_slot × 21)  // 0–20 sats
pool_fee_out  = pool_fee_base + dust   // slightly above 2%, at most 20 sats over
```
Dust is always < 21 sats and goes to the pool fee address. Never lost. Pool fee is approximately 2% of total reward.

Satoshi arithmetic uses Go `int64` throughout (max ~9.2×10^18; total Bitcoin supply is ~2.1×10^15 sats — no overflow possible).

### Per-Miner Template Personalization

Every connected miner receives a unique block template. Slot 1 (finder address) is their own BTC address. Slots 2–22 (top 21 ranked) are identical across all templates — they are a snapshot of the current leaderboard at template construction time.

If the finder is already in the top 21, their address appears in both slot 1 and one of slots 2–22. Bitcoin permits duplicate output addresses; they receive two UTXOs from the same coinbase.

### Fewer Than 21 Ranked Miners

Unfilled slots fold into the pool fee address. Per-slot amount stays fixed. Pool fee is higher than 2% temporarily — disclosed on the transparency page and self-correcting as miners join.

### SegWit Witness Commitment

datum_gateway appends the mandatory `OP_RETURN` witness commitment automatically using the `default_witness_commitment` field from Bitcoin Core's `getblocktemplate` RPC response. No custom code needed.

---

## 7. Unix Socket Protocol

Socket path: `/var/run/unlucky21/reward.sock`

### COINBASE_REQUEST (blocking)
datum_gateway waits for response before sending template to miner.
```json
// Request
{"type": "coinbase", "miner_address": "bc1q...", "fees_sats": 1250000}

// Response
{"outputs": [
  {"address": "bc1q...",     "amount_sats": 50000000},
  {"address": "bc1qrank1...", "amount_sats": 12453619},
  ...
  {"address": "bc1pool...",  "amount_sats": 6312762}
]}
```

### SHARE_SUBMIT (fire-and-forget)
datum_gateway does not wait for acknowledgment.
```json
{"type": "share", "btc_address": "bc1q...", "worker_name": "rig1",
 "difficulty": "4831838208", "is_stale": false}
```
Difficulty is serialized as a string to safely carry 256-bit values across JSON.

### BLOCK_FOUND (blocking)
datum_gateway waits for acknowledgment before broadcasting `mining.notify` to all miners.
```json
// Request
{"type": "block_found", "height": 840001, "hash": "000000...",
 "finder_address": "bc1q...", "coinbase_txid": "aff7c9..."}

// Response
{"status": "ok"}
```

---

## 8. Full Data Flow

```
1.  Miner connects → mining.subscribe + mining.authorize (BTC address as username)
2.  datum_gateway → Unix socket → Go: COINBASE_REQUEST {miner_address, fees_sats}
3.  Go: lock leaderboard snapshot, compute output amounts
4.  Go → datum_gateway: ordered output list
5.  datum_gateway → Bitcoin Core RPC: getblocktemplate
6.  datum_gateway: assemble coinbase (outputs + SegWit commitment)
7.  datum_gateway → miner: mining.notify (personalized template)

8.  Miner submits share → datum_gateway validates
9.  datum_gateway → Unix socket → Go: SHARE_SUBMIT (fire-and-forget)
10. Go → PostgreSQL: INSERT share, UPDATE workers.last_seen
11. Go: if new best share for this address, invalidate leaderboard cache

12. Share meets network target → datum_gateway → Bitcoin Core RPC: submitblock
13. datum_gateway → Unix socket → Go: BLOCK_FOUND {height, hash, finder, txid}
14. Go: write lock → snapshot top 21 → record block → close round → open new round → release lock
15. Go → PostgreSQL: commit all in one transaction
16. datum_gateway → all miners: mining.notify (fresh template, clean state)
```

---

## 9. Edge Cases

### Go service unavailable at coinbase request
datum_gateway falls back to a single-output coinbase: the requesting miner's address receives the full block reward (pure solo mode). No block is lost. No miner is left unpaid. Go service restart recovers without data loss — shares already in PostgreSQL are intact.

### Block found during leaderboard reset (race condition)
On BLOCK_FOUND, Go service acquires a write lock: snapshot top 21 → record block → close round → open new round → release lock. All concurrent COINBASE_REQUESTs wait on the lock and immediately receive the fresh empty leaderboard on release. No template is ever built against a partially-reset state.

### Miner pushed out of top 21 in last second
The coinbase snapshot is taken atomically at COINBASE_REQUEST time and committed into the template. If a miner drops from #21 to #22 after the template is issued but before the block is found, they are not paid. Disclosed explicitly in the transparency/disclaimer page.

### Stale shares on block transition
Shares arriving after datum_gateway has already submitted the block are flagged `is_stale = true` in SHARE_SUBMIT. Go records them for hashrate estimation but excludes them from ranking. Stale shares do not affect payouts.

### Transaction fees (dynamic reward)
The Go service receives `fees_sats` in every COINBASE_REQUEST and computes all output amounts dynamically against `subsidy + fees`. Miners in the top 21 benefit proportionally from fee-rich blocks. The pool fee is always exactly 2% of total.

---

## 10. Bitcoin Core Configuration

```ini
# bitcoin.conf — signet mode (Phase 1)
signet=1
server=1
rpcuser=unlucky21
rpcpassword=<strong-random-password>
rpcallowip=127.0.0.1

# Reserve block weight for coinbase with 25 outputs (default 4000 is too small)
# 23 value outputs + 2 OP_RETURN outputs × ~200 weight units each ≈ 5000 minimum
# Set to 100000 for permanent headroom regardless of future output count growth
coinbasetxnweight=100000
```

Verify exact parameter name against installed Bitcoin Core version: `bitcoind -help | grep coinbase`

---

## 11. Signet Testing Plan

Signet difficulty is low enough for CPU mining. Full end-to-end validation before mainnet.

### Phase 1a — Plumbing (no custom code)
- [ ] Bitcoin Core running in signet mode on VPS
- [ ] datum_gateway connects to Core via RPC, accepts Stratum connections
- [ ] cpuminer-multi connects to datum_gateway, submits shares
- [ ] Verify: shares arrive, datum_gateway submits blocks, Core accepts them

### Phase 1b — Go service integration
- [ ] Go service starts, Unix socket live
- [ ] datum_gateway routes COINBASE_REQUEST through Go service
- [ ] Verify: coinbase has correct output count and amounts
- [ ] Verify: each connected miner gets their own address in slot 1

### Phase 1c — Leaderboard logic
- [ ] Multiple simulated addresses submit shares at varying difficulties
- [ ] Verify: top 21 ranking reflects MAX(share_difficulty) per address
- [ ] Verify: address with last share > 7 days drops off leaderboard
- [ ] Verify: address with last share < 7 days stays on leaderboard

### Phase 1d — Block found + reset
- [ ] CPU miner finds a signet block
- [ ] Verify: BLOCK_FOUND triggers round close in PostgreSQL
- [ ] Verify: top_21_snapshot saved correctly in blocks table
- [ ] Verify: new round opens, leaderboard shows empty
- [ ] Verify: coinbase outputs on-chain match snapshot (signet block explorer)

### Phase 1e — Failure modes
- [ ] Kill Go service mid-run → datum_gateway falls back to solo coinbase
- [ ] Restart Go service → reconnects, resumes correctly
- [ ] Submit stale share → is_stale recorded, excluded from ranking
- [ ] Simulate < 21 ranked miners → unfilled slots absorbed into pool fee

**Tooling:** cpuminer-multi, bitcoin-cli, mempool.space signet explorer

---

## 12. Production VPS Spec (Phase 1 — single server)

| Spec | Value |
|---|---|
| Provider | Hetzner CX31 |
| CPU | 4 vCPU |
| RAM | 8 GB |
| Storage | 80 GB NVMe SSD |
| OS | Ubuntu 24.04 LTS |
| Network | 1 Gbps |
| Purpose | Bitcoin Core (signet) + datum_gateway + Go service + PostgreSQL |

Production mainnet will split these onto separate servers. This single-server setup is Phase 1 / signet only.

---

## 13. Out of Scope for Phase 1

- Web dashboard (Phase 2)
- Monitoring stack — Prometheus, Grafana, Uptime Kuma (Phase 3)
- Stratum V2 bridge
- Mainnet deployment
- Anti-abuse / soft hashrate cap (implements at dashboard layer in Phase 2)
- "Home miner verified" badge (Phase 2)
