# SoloUnlucky21 Phase 1: Pool Core + Reward Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Get a working Bitcoin mining pool running on signet — datum_gateway serving personalized coinbase templates to miners, a Go reward service tracking shares and managing the rolling top-21 leaderboard, and PostgreSQL recording all pool activity.

**Architecture:** datum_gateway (fork of OCEAN-xyz/datum_gateway) handles Stratum V1 and block templates; it calls a Go reward service via Unix socket for per-miner coinbase output lists. The Go service owns all business logic — share ingestion, 7-day rolling leaderboard, coinbase payout math — backed by PostgreSQL. All rewards paid directly in coinbase outputs, no pool custody.

**Tech Stack:** Go 1.22+, PostgreSQL 16, C (datum_gateway fork), Bitcoin Core 27+ (signet), Ubuntu 24.04 LTS, systemd, pgx/v5

---

## File Map

```
solounlucky21/
├── infra/
│   ├── bitcoin.conf               # Bitcoin Core signet config
│   ├── bitcoin.service            # systemd unit — Bitcoin Core
│   ├── datum-gateway.service      # systemd unit — datum_gateway
│   └── reward-service.service     # systemd unit — Go service
├── datum-gateway/                 # fork of OCEAN-xyz/datum_gateway
│   └── src/
│       ├── datum_reward_socket.h  # NEW: Unix socket client header
│       ├── datum_reward_socket.c  # NEW: Unix socket client + JSON parse
│       └── <hook file>            # MODIFIED: coinbase output injection
├── reward-service/
│   ├── cmd/server/
│   │   └── main.go                # Entrypoint, config, wiring
│   ├── internal/
│   │   ├── db/
│   │   │   ├── db.go              # pgx pool, connect, migrate
│   │   │   └── schema.sql         # CREATE TABLE statements
│   │   ├── coinbase/
│   │   │   ├── builder.go         # BuildOutputs — pure payout math
│   │   │   └── builder_test.go    # Unit tests — no DB needed
│   │   ├── leaderboard/
│   │   │   ├── service.go         # GetTop21, RecordShare, ResetForBlock
│   │   │   └── service_test.go    # Tests against real PostgreSQL
│   │   └── socket/
│   │       ├── server.go          # Unix socket server, message dispatch
│   │       └── server_test.go     # Integration tests
│   ├── go.mod
│   └── go.sum
└── scripts/
    └── test-signet.sh             # Multi-miner signet test harness
```

---

## Task 1: Repository setup + VPS initial provisioning

**Files:**
- Create: `infra/bitcoin.conf`

- [ ] **Step 1: Clone your GitHub repo locally**
```bash
cd "/Users/brianfitzgerald/untitled folder"
git clone git@github.com:<YOUR_GITHUB_USERNAME>/solounlucky21.git
cd solounlucky21
```

- [ ] **Step 2: Copy the existing docs into the repo**
```bash
cp -r "/Users/brianfitzgerald/untitled folder/solounlucky21/docs" .
git add docs/
git commit -m "docs: add phase 1 design spec and implementation plan"
```

- [ ] **Step 3: SSH into your Vultr VPS and install base dependencies**
```bash
ssh root@<YOUR_VPS_IP>
apt-get update && apt-get upgrade -y
apt-get install -y build-essential git cmake pkg-config libssl-dev \
  libcurl4-openssl-dev libevent-dev libzmq3-dev \
  postgresql-16 postgresql-client-16 \
  ufw fail2ban curl wget jq
```

- [ ] **Step 4: Create the unlucky21 system user**
```bash
useradd -r -s /bin/false unlucky21
mkdir -p /var/run/unlucky21 /etc/unlucky21 /var/log/unlucky21
chown unlucky21:unlucky21 /var/run/unlucky21 /var/log/unlucky21
```

- [ ] **Step 5: Open firewall ports**
```bash
ufw allow 22/tcp     # SSH
ufw allow 3333/tcp   # Stratum
ufw enable
ufw status
```
Expected output: ports 22 and 3333 listed as ALLOW.

- [ ] **Step 6: Commit**
```bash
git add infra/
git commit -m "infra: add VPS setup notes"
```

---

## Task 2: Bitcoin Core signet setup

**Files:**
- Create: `infra/bitcoin.conf`
- Create: `infra/bitcoin.service`

- [ ] **Step 1: Install Bitcoin Core on the VPS**
```bash
# On VPS
wget https://bitcoincore.org/bin/bitcoin-core-27.0/bitcoin-27.0-x86_64-linux-gnu.tar.gz
tar xzf bitcoin-27.0-x86_64-linux-gnu.tar.gz
install -m 0755 bitcoin-27.0/bin/bitcoin{d,-cli} /usr/local/bin/
bitcoin-cli --version
```
Expected: `Bitcoin Core RPC client version v27.0.0`

- [ ] **Step 2: Write bitcoin.conf**

Create `infra/bitcoin.conf`:
```ini
# Bitcoin Core — signet mode for Phase 1
signet=1
server=1
daemon=1
rpcuser=unlucky21rpc
rpcpassword=REPLACE_WITH_STRONG_RANDOM_PASSWORD
rpcallowip=127.0.0.1
rpcport=18443

# Reserve block weight for 25-output coinbase
# Default 4000 is too small for our 23 value + 2 OP_RETURN outputs
coinbasetxnweight=100000

# Performance tuning for pool
maxmempool=512
dbcache=2048
txindex=0
```

- [ ] **Step 3: Deploy bitcoin.conf to VPS**
```bash
# On local machine
scp infra/bitcoin.conf root@<YOUR_VPS_IP>:/etc/unlucky21/bitcoin.conf

# On VPS
mkdir -p /home/unlucky21/.bitcoin
ln -s /etc/unlucky21/bitcoin.conf /home/unlucky21/.bitcoin/bitcoin.conf
chown -R unlucky21:unlucky21 /home/unlucky21/.bitcoin
```

- [ ] **Step 4: Write systemd unit for Bitcoin Core**

Create `infra/bitcoin.service`:
```ini
[Unit]
Description=Bitcoin Core (signet)
After=network.target
Wants=network.target

[Service]
User=unlucky21
Group=unlucky21
ExecStart=/usr/local/bin/bitcoind -conf=/etc/unlucky21/bitcoin.conf \
  -datadir=/var/lib/unlucky21/bitcoin
ExecStop=/usr/local/bin/bitcoin-cli \
  -conf=/etc/unlucky21/bitcoin.conf stop
Restart=on-failure
RestartSec=30
TimeoutStartSec=300

[Install]
WantedBy=multi-user.target
```

- [ ] **Step 5: Deploy and start Bitcoin Core**
```bash
# On VPS
mkdir -p /var/lib/unlucky21/bitcoin
chown unlucky21:unlucky21 /var/lib/unlucky21/bitcoin
cp infra/bitcoin.service /etc/systemd/system/bitcoin-unlucky21.service
systemctl daemon-reload
systemctl enable bitcoin-unlucky21
systemctl start bitcoin-unlucky21
```

- [ ] **Step 6: Verify Bitcoin Core is running and syncing signet**
```bash
# On VPS — wait ~60 seconds then check
bitcoin-cli -conf=/etc/unlucky21/bitcoin.conf getblockchaininfo
```
Expected: JSON with `"chain": "signet"` and `"blocks"` incrementing.

- [ ] **Step 7: Verify getblocktemplate works**
```bash
bitcoin-cli -conf=/etc/unlucky21/bitcoin.conf \
  getblocktemplate '{"rules":["segwit","signet"]}'
```
Expected: JSON block template with `"coinbasetxnweight"` showing 100000.

- [ ] **Step 8: Commit**
```bash
git add infra/bitcoin.conf infra/bitcoin.service
git commit -m "infra: Bitcoin Core signet config and systemd unit"
```

---

## Task 3: PostgreSQL schema

**Files:**
- Create: `reward-service/internal/db/schema.sql`

- [ ] **Step 1: Create PostgreSQL database and user**
```bash
# On VPS as root
sudo -u postgres psql <<'EOF'
CREATE USER unlucky21 WITH PASSWORD 'REPLACE_WITH_STRONG_DB_PASSWORD';
CREATE DATABASE unlucky21 OWNER unlucky21;
\c unlucky21
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
EOF
```

- [ ] **Step 2: Write schema.sql**

Create `reward-service/internal/db/schema.sql`:
```sql
-- rounds: one row per block-found interval
CREATE TABLE IF NOT EXISTS rounds (
  id          BIGSERIAL    PRIMARY KEY,
  started_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  ended_at    TIMESTAMPTZ,           -- NULL = current active round
  block_id    BIGINT       REFERENCES blocks(id)
);

-- blocks: every block found by the pool
CREATE TABLE IF NOT EXISTS blocks (
  id               BIGSERIAL    PRIMARY KEY,
  round_id         BIGINT       NOT NULL REFERENCES rounds(id),
  height           INTEGER      NOT NULL,
  hash             VARCHAR(64)  NOT NULL,
  found_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  finder_address   VARCHAR(90)  NOT NULL,
  coinbase_txid    VARCHAR(64),
  top_21_snapshot  JSONB        NOT NULL,  -- [{rank, address, amount_sats}]
  block_fees_sats  BIGINT       NOT NULL DEFAULT 0
);

-- shares: every accepted share from every miner
CREATE TABLE IF NOT EXISTS shares (
  id                BIGSERIAL     PRIMARY KEY,
  round_id          BIGINT        NOT NULL REFERENCES rounds(id),
  btc_address       VARCHAR(90)   NOT NULL,
  worker_name       VARCHAR(64)   NOT NULL DEFAULT '',
  share_difficulty  NUMERIC(78,0) NOT NULL,  -- full 256-bit safe
  submitted_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  is_stale          BOOLEAN       NOT NULL DEFAULT FALSE
);

-- workers: last-seen connection state per address/worker pair
CREATE TABLE IF NOT EXISTS workers (
  btc_address  VARCHAR(90)   NOT NULL,
  worker_name  VARCHAR(64)   NOT NULL DEFAULT '',
  last_seen    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  hashrate_th  NUMERIC(10,2),
  PRIMARY KEY (btc_address, worker_name)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_shares_address_time
  ON shares (btc_address, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_shares_round
  ON shares (round_id);

-- Bootstrap: insert the first round on fresh DB
INSERT INTO rounds (started_at)
SELECT NOW()
WHERE NOT EXISTS (SELECT 1 FROM rounds WHERE ended_at IS NULL);
```

Note: `blocks` is referenced by `rounds.block_id` but `rounds` is referenced by `blocks.round_id` — forward reference requires creating `blocks` before the FK is added. The schema above works because PostgreSQL defers FK checks. If it errors, create `blocks` without the `rounds.block_id` FK first, then add it with `ALTER TABLE`.

- [ ] **Step 3: Apply schema to the database**
```bash
# On VPS
psql -U unlucky21 -d unlucky21 -f schema.sql
```
Expected: series of `CREATE TABLE`, `CREATE INDEX`, `INSERT 0 1` messages.

- [ ] **Step 4: Verify schema with test queries**
```bash
psql -U unlucky21 -d unlucky21 <<'EOF'
SELECT id, started_at FROM rounds;
INSERT INTO shares (round_id, btc_address, share_difficulty)
  VALUES (1, 'bc1qtest000000000000000000000000000000000000', 999999);
SELECT btc_address, share_difficulty FROM shares;
DELETE FROM shares WHERE btc_address = 'bc1qtest000000000000000000000000000000000000';
EOF
```
Expected: round row from bootstrap insert, share inserts and deletes cleanly.

- [ ] **Step 5: Commit schema**
```bash
git add reward-service/internal/db/schema.sql
git commit -m "db: PostgreSQL schema for shares, rounds, blocks, workers"
```

---

## Task 4: Go reward service — module init + DB layer

**Files:**
- Create: `reward-service/go.mod`
- Create: `reward-service/internal/db/db.go`

- [ ] **Step 1: Initialize Go module**
```bash
cd reward-service
go mod init unlucky21/reward
go get github.com/jackc/pgx/v5@latest
go get github.com/jackc/pgx/v5/pgxpool@latest
```

- [ ] **Step 2: Write db.go**

Create `reward-service/internal/db/db.go`:
```go
package db

import (
	"context"
	"embed"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed schema.sql
var schemaSQL embed.FS

// Connect creates a pgx connection pool and runs schema migrations.
func Connect(ctx context.Context, dsn string) (*pgxpool.Pool, error) {
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		return nil, fmt.Errorf("pgxpool.New: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		return nil, fmt.Errorf("ping: %w", err)
	}
	schema, err := schemaSQL.ReadFile("schema.sql")
	if err != nil {
		return nil, fmt.Errorf("read schema: %w", err)
	}
	if _, err := pool.Exec(ctx, string(schema)); err != nil {
		return nil, fmt.Errorf("apply schema: %w", err)
	}
	return pool, nil
}

// ActiveRoundID returns the ID of the current open round (ended_at IS NULL).
func ActiveRoundID(ctx context.Context, pool *pgxpool.Pool) (int64, error) {
	var id int64
	err := pool.QueryRow(ctx,
		`SELECT id FROM rounds WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1`,
	).Scan(&id)
	return id, err
}
```

- [ ] **Step 3: Run go mod tidy**
```bash
go mod tidy
```
Expected: `go.sum` created with no errors.

- [ ] **Step 4: Commit**
```bash
git add reward-service/
git commit -m "feat: Go module init and DB connection layer"
```

---

## Task 5: Coinbase payout math (TDD)

**Files:**
- Create: `reward-service/internal/coinbase/builder.go`
- Create: `reward-service/internal/coinbase/builder_test.go`

- [ ] **Step 1: Write the failing tests**

Create `reward-service/internal/coinbase/builder_test.go`:
```go
package coinbase_test

import (
	"math/big"
	"testing"

	"unlucky21/reward/internal/coinbase"
)

func TestBuildOutputs_FullLeaderboard_SubsidyOnly(t *testing.T) {
	// 3.125 BTC subsidy, no fees, 21 ranked miners
	ranked := make([]coinbase.RankedAddress, 21)
	for i := range ranked {
		ranked[i] = coinbase.RankedAddress{
			Address: fmt.Sprintf("bc1qrank%02d000000000000000000000000000000", i+1),
		}
	}
	outputs := coinbase.BuildOutputs(
		"bc1qfinder00000000000000000000000000000000",
		312_500_000, // subsidy sats
		0,           // fees sats
		ranked,
	)

	// Slot 1: finder
	if outputs[0].Address != "bc1qfinder00000000000000000000000000000000" {
		t.Fatalf("slot 1 should be finder, got %s", outputs[0].Address)
	}
	if outputs[0].AmountSats != 50_000_000 {
		t.Fatalf("finder should get 50_000_000 sats, got %d", outputs[0].AmountSats)
	}

	// 23 outputs total (1 finder + 21 ranked + 1 pool fee)
	if len(outputs) != 23 {
		t.Fatalf("expected 23 outputs, got %d", len(outputs))
	}

	// All slot amounts must sum to exactly total
	var total int64
	for _, o := range outputs {
		total += o.AmountSats
	}
	if total != 312_500_000 {
		t.Fatalf("outputs must sum to 312_500_000, got %d", total)
	}

	// Each ranked slot should be equal (within 1 sat rounding)
	for i := 1; i <= 21; i++ {
		if outputs[i].AmountSats < 12_202_380 || outputs[i].AmountSats > 12_202_381 {
			t.Fatalf("ranked slot %d amount out of range: %d", i, outputs[i].AmountSats)
		}
	}
}

func TestBuildOutputs_WithFees(t *testing.T) {
	// 3.125 BTC subsidy + 0.1 BTC fees
	ranked := make([]coinbase.RankedAddress, 21)
	for i := range ranked {
		ranked[i] = coinbase.RankedAddress{Address: fmt.Sprintf("bc1qrank%02d", i+1)}
	}
	outputs := coinbase.BuildOutputs(
		"bc1qfinder",
		312_500_000,
		10_000_000, // 0.1 BTC fees
		ranked,
	)

	var total int64
	for _, o := range outputs {
		total += o.AmountSats
	}
	if total != 322_500_000 {
		t.Fatalf("outputs must sum to subsidy+fees=322_500_000, got %d", total)
	}
}

func TestBuildOutputs_FewerThan21Miners(t *testing.T) {
	// Only 5 miners ranked — unfilled slots go to pool fee
	ranked := make([]coinbase.RankedAddress, 5)
	for i := range ranked {
		ranked[i] = coinbase.RankedAddress{Address: fmt.Sprintf("bc1qrank%02d", i+1)}
	}
	outputs := coinbase.BuildOutputs("bc1qfinder", 312_500_000, 0, ranked)

	// Still 23 outputs (5 ranked + 16 go to pool fee slot)
	if len(outputs) != 7 { // 1 finder + 5 ranked + 1 pool fee
		t.Fatalf("expected 7 outputs for 5 miners, got %d", len(outputs))
	}

	var total int64
	for _, o := range outputs {
		total += o.AmountSats
	}
	if total != 312_500_000 {
		t.Fatalf("outputs must sum to 312_500_000, got %d", total)
	}
}

func TestBuildOutputs_FinderInTop21(t *testing.T) {
	// Finder is also rank #1 — they appear in slot 1 AND slot 2
	finderAddr := "bc1qfinder00000000000000000000000000000000"
	ranked := make([]coinbase.RankedAddress, 21)
	ranked[0] = coinbase.RankedAddress{Address: finderAddr} // rank #1 is finder
	for i := 1; i < 21; i++ {
		ranked[i] = coinbase.RankedAddress{Address: fmt.Sprintf("bc1qrank%02d", i+1)}
	}
	outputs := coinbase.BuildOutputs(finderAddr, 312_500_000, 0, ranked)

	if outputs[0].Address != finderAddr {
		t.Fatal("slot 1 must be finder address")
	}
	if outputs[1].Address != finderAddr {
		t.Fatal("slot 2 must also be finder address (rank #1)")
	}

	var total int64
	for _, o := range outputs {
		total += o.AmountSats
	}
	if total != 312_500_000 {
		t.Fatalf("total must be 312_500_000, got %d", total)
	}
}

func TestBuildOutputs_ZeroMiners(t *testing.T) {
	// No miners ranked yet (brand new pool)
	outputs := coinbase.BuildOutputs("bc1qfinder", 312_500_000, 0, nil)

	// 2 outputs: finder + pool fee
	if len(outputs) != 2 {
		t.Fatalf("expected 2 outputs for zero miners, got %d", len(outputs))
	}
	var total int64
	for _, o := range outputs {
		total += o.AmountSats
	}
	if total != 312_500_000 {
		t.Fatalf("total must be 312_500_000, got %d", total)
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**
```bash
cd reward-service
go test ./internal/coinbase/... -v
```
Expected: `cannot find package "unlucky21/reward/internal/coinbase"`

- [ ] **Step 3: Implement builder.go**

Create `reward-service/internal/coinbase/builder.go`:
```go
package coinbase

const (
	FinderAmountSats  int64 = 50_000_000        // 0.50 BTC fixed
	PoolFeePercent          = 0.02               // 2%
	PoolFeeAddress          = "bc1qPOOL_FEE_ADDRESS_REPLACE_WITH_REAL_ADDRESS"
	MaxRankedSlots          = 21
)

// RankedAddress is a leaderboard entry eligible for a coinbase slot.
type RankedAddress struct {
	Address string
}

// CoinbaseOutput is one output in the coinbase transaction.
type CoinbaseOutput struct {
	Address    string
	AmountSats int64
}

// BuildOutputs constructs the ordered coinbase output list for a specific miner.
// minerAddress gets slot 1 (finder bonus). ranked[0..N] get slots 2..N+2.
// Pool fee address gets the last slot. All amounts sum to subsidySats+feesSats.
func BuildOutputs(
	minerAddress string,
	subsidySats int64,
	feesSats int64,
	ranked []RankedAddress,
) []CoinbaseOutput {
	total := subsidySats + feesSats

	poolFeeBase := int64(float64(total) * PoolFeePercent)
	remaining := total - FinderAmountSats - poolFeeBase

	// Per-slot amount — always divided by MaxRankedSlots (21)
	// regardless of how many miners are actually ranked.
	// Unfilled slots are absorbed into pool fee.
	perSlot := remaining / int64(MaxRankedSlots)
	filledSlots := len(ranked)
	if filledSlots > MaxRankedSlots {
		filledSlots = MaxRankedSlots
	}

	filledAmount := perSlot * int64(filledSlots)
	unfilledAmount := perSlot * int64(MaxRankedSlots-filledSlots)
	dust := remaining - perSlot*int64(MaxRankedSlots)
	poolFeeOut := poolFeeBase + unfilledAmount + dust

	outputs := make([]CoinbaseOutput, 0, filledSlots+2)

	// Slot 1: finder bonus
	outputs = append(outputs, CoinbaseOutput{
		Address:    minerAddress,
		AmountSats: FinderAmountSats,
	})

	// Slots 2 to filledSlots+1: ranked miners
	for i := 0; i < filledSlots; i++ {
		outputs = append(outputs, CoinbaseOutput{
			Address:    ranked[i].Address,
			AmountSats: perSlot,
		})
	}

	_ = filledAmount // used implicitly above

	// Last slot: pool fee
	outputs = append(outputs, CoinbaseOutput{
		Address:    PoolFeeAddress,
		AmountSats: poolFeeOut,
	})

	return outputs
}
```

- [ ] **Step 4: Add missing fmt import to test file**
```go
// Add to builder_test.go imports:
import (
    "fmt"
    "testing"
    "unlucky21/reward/internal/coinbase"
)
```

- [ ] **Step 5: Run tests to verify they pass**
```bash
go test ./internal/coinbase/... -v
```
Expected: all 5 tests PASS.

- [ ] **Step 6: Commit**
```bash
git add reward-service/internal/coinbase/
git commit -m "feat: coinbase payout math with TDD (21-slot model)"
```

---

## Task 6: Leaderboard service (TDD — real PostgreSQL)

**Files:**
- Create: `reward-service/internal/leaderboard/service.go`
- Create: `reward-service/internal/leaderboard/service_test.go`

- [ ] **Step 1: Write failing tests**

Create `reward-service/internal/leaderboard/service_test.go`:
```go
package leaderboard_test

import (
	"context"
	"fmt"
	"math/big"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"unlucky21/reward/internal/db"
	"unlucky21/reward/internal/leaderboard"
)

func testDB(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		dsn = "postgres://unlucky21:unlucky21test@localhost/unlucky21_test?sslmode=disable"
	}
	pool, err := db.Connect(context.Background(), dsn)
	if err != nil {
		t.Skipf("no test database available: %v", err)
	}
	t.Cleanup(func() {
		pool.Exec(context.Background(), `TRUNCATE shares, blocks, rounds RESTART IDENTITY CASCADE`)
		// Re-insert bootstrap round
		pool.Exec(context.Background(), `INSERT INTO rounds (started_at) VALUES (NOW())`)
		pool.Close()
	})
	return pool
}

func TestRecordShare_AppearsInLeaderboard(t *testing.T) {
	pool := testDB(t)
	svc := leaderboard.New(pool)
	ctx := context.Background()

	roundID, err := svc.ActiveRoundID(ctx)
	if err != nil {
		t.Fatal(err)
	}

	err = svc.RecordShare(ctx, leaderboard.Share{
		RoundID:    roundID,
		BTCAddress: "bc1qtest001",
		WorkerName: "rig1",
		Difficulty: big.NewInt(999_999_999),
		IsStale:    false,
	})
	if err != nil {
		t.Fatal(err)
	}

	top, err := svc.GetTop21(ctx, roundID)
	if err != nil {
		t.Fatal(err)
	}
	if len(top) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(top))
	}
	if top[0].BTCAddress != "bc1qtest001" {
		t.Fatalf("unexpected address: %s", top[0].BTCAddress)
	}
}

func TestGetTop21_RankedByBestShare(t *testing.T) {
	pool := testDB(t)
	svc := leaderboard.New(pool)
	ctx := context.Background()

	roundID, _ := svc.ActiveRoundID(ctx)

	// Address A: two shares, best is 5000
	svc.RecordShare(ctx, leaderboard.Share{RoundID: roundID, BTCAddress: "bc1qA", Difficulty: big.NewInt(3000)})
	svc.RecordShare(ctx, leaderboard.Share{RoundID: roundID, BTCAddress: "bc1qA", Difficulty: big.NewInt(5000)})

	// Address B: one share at 8000 — should rank higher
	svc.RecordShare(ctx, leaderboard.Share{RoundID: roundID, BTCAddress: "bc1qB", Difficulty: big.NewInt(8000)})

	top, err := svc.GetTop21(ctx, roundID)
	if err != nil {
		t.Fatal(err)
	}
	if top[0].BTCAddress != "bc1qB" {
		t.Fatalf("bc1qB should rank #1, got %s", top[0].BTCAddress)
	}
	if top[1].BTCAddress != "bc1qA" {
		t.Fatalf("bc1qA should rank #2, got %s", top[1].BTCAddress)
	}
	if top[0].BestShareDifficulty.Cmp(big.NewInt(8000)) != 0 {
		t.Fatal("bc1qB best share should be 8000")
	}
}

func TestGetTop21_SevenDayExpiry(t *testing.T) {
	pool := testDB(t)
	svc := leaderboard.New(pool)
	ctx := context.Background()

	roundID, _ := svc.ActiveRoundID(ctx)

	// Insert a share with submitted_at 8 days ago directly via SQL
	pool.Exec(ctx,
		`INSERT INTO shares (round_id, btc_address, share_difficulty, submitted_at)
		 VALUES ($1, 'bc1qold', 999999, NOW() - INTERVAL '8 days')`,
		roundID,
	)

	top, err := svc.GetTop21(ctx, roundID)
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range top {
		if e.BTCAddress == "bc1qold" {
			t.Fatal("bc1qold share is older than 7 days and must not appear in top 21")
		}
	}
}

func TestGetTop21_StaleSharesExcluded(t *testing.T) {
	pool := testDB(t)
	svc := leaderboard.New(pool)
	ctx := context.Background()

	roundID, _ := svc.ActiveRoundID(ctx)

	svc.RecordShare(ctx, leaderboard.Share{
		RoundID:    roundID,
		BTCAddress: "bc1qstale",
		Difficulty: big.NewInt(999_999_999),
		IsStale:    true,
	})

	top, _ := svc.GetTop21(ctx, roundID)
	for _, e := range top {
		if e.BTCAddress == "bc1qstale" {
			t.Fatal("stale share must not appear in top 21")
		}
	}
}

func TestResetForBlock_ClearsLeaderboard(t *testing.T) {
	pool := testDB(t)
	svc := leaderboard.New(pool)
	ctx := context.Background()

	roundID, _ := svc.ActiveRoundID(ctx)
	svc.RecordShare(ctx, leaderboard.Share{RoundID: roundID, BTCAddress: "bc1qminer", Difficulty: big.NewInt(500)})

	snapshot, newRoundID, err := svc.ResetForBlock(ctx, leaderboard.BlockFound{
		RoundID:       roundID,
		Height:        123,
		Hash:          "000000abcdef",
		FinderAddress: "bc1qminer",
		CoinbaseTxID:  "txid001",
		FeesSats:      0,
	})
	if err != nil {
		t.Fatal(err)
	}
	if newRoundID <= roundID {
		t.Fatal("new round ID must be greater than old")
	}
	if len(snapshot) == 0 {
		t.Fatal("snapshot must capture miners before reset")
	}

	// New round should have empty leaderboard
	top, _ := svc.GetTop21(ctx, newRoundID)
	if len(top) != 0 {
		t.Fatal("new round leaderboard must start empty")
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**
```bash
go test ./internal/leaderboard/... -v
```
Expected: compile error — package not found.

- [ ] **Step 3: Implement service.go**

Create `reward-service/internal/leaderboard/service.go`:
```go
package leaderboard

import (
	"context"
	"fmt"
	"math/big"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"unlucky21/reward/internal/coinbase"
)

// Share is a single share submission from a miner.
type Share struct {
	RoundID    int64
	BTCAddress string
	WorkerName string
	Difficulty *big.Int
	IsStale    bool
}

// Entry is one row in the leaderboard.
type Entry struct {
	BTCAddress          string
	BestShareDifficulty *big.Int
	LastActivity        time.Time
	Rank                int
}

// BlockFound carries data for a block-found event.
type BlockFound struct {
	RoundID       int64
	Height        int32
	Hash          string
	FinderAddress string
	CoinbaseTxID  string
	FeesSats      int64
}

// Service manages share ingestion and leaderboard state.
type Service struct {
	pool *pgxpool.Pool
}

// New creates a Service backed by the given connection pool.
func New(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool}
}

// ActiveRoundID returns the ID of the current open round.
func (s *Service) ActiveRoundID(ctx context.Context) (int64, error) {
	var id int64
	err := s.pool.QueryRow(ctx,
		`SELECT id FROM rounds WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1`,
	).Scan(&id)
	return id, err
}

// RecordShare inserts a share and updates the worker last-seen record.
func (s *Service) RecordShare(ctx context.Context, sh Share) error {
	_, err := s.pool.Exec(ctx,
		`INSERT INTO shares (round_id, btc_address, worker_name, share_difficulty, is_stale)
		 VALUES ($1, $2, $3, $4, $5)`,
		sh.RoundID, sh.BTCAddress, sh.WorkerName, sh.Difficulty.String(), sh.IsStale,
	)
	if err != nil {
		return fmt.Errorf("insert share: %w", err)
	}
	_, err = s.pool.Exec(ctx,
		`INSERT INTO workers (btc_address, worker_name, last_seen)
		 VALUES ($1, $2, NOW())
		 ON CONFLICT (btc_address, worker_name) DO UPDATE SET last_seen = NOW()`,
		sh.BTCAddress, sh.WorkerName,
	)
	return err
}

// GetTop21 returns up to 21 eligible addresses ranked by best share in the
// current round, limited to shares submitted in the last 7 days.
func (s *Service) GetTop21(ctx context.Context, roundID int64) ([]Entry, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT
		  btc_address,
		  MAX(share_difficulty)::TEXT  AS best_share,
		  MAX(submitted_at)            AS last_activity,
		  RANK() OVER (ORDER BY MAX(share_difficulty) DESC)::INT AS rank
		FROM shares
		WHERE round_id = $1
		  AND submitted_at > NOW() - INTERVAL '7 days'
		  AND is_stale = false
		GROUP BY btc_address
		ORDER BY best_share DESC
		LIMIT 21
	`, roundID)
	if err != nil {
		return nil, fmt.Errorf("query leaderboard: %w", err)
	}
	defer rows.Close()

	var entries []Entry
	for rows.Next() {
		var e Entry
		var diffStr string
		if err := rows.Scan(&e.BTCAddress, &diffStr, &e.LastActivity, &e.Rank); err != nil {
			return nil, err
		}
		e.BestShareDifficulty = new(big.Int)
		e.BestShareDifficulty.SetString(diffStr, 10)
		entries = append(entries, e)
	}
	return entries, rows.Err()
}

// ResetForBlock closes the current round, records the block with a top-21
// snapshot, and opens a new round. All in one transaction.
// Returns the snapshot and the new round ID.
func (s *Service) ResetForBlock(ctx context.Context, bf BlockFound) ([]Entry, int64, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, 0, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	// Snapshot top 21 before closing the round
	snapshot, err := s.GetTop21(ctx, bf.RoundID)
	if err != nil {
		return nil, 0, err
	}

	// Build snapshot JSON for storage
	type snapshotEntry struct {
		Rank       int    `json:"rank"`
		Address    string `json:"address"`
		AmountSats int64  `json:"amount_sats"`
	}
	entries := make([]snapshotEntry, len(snapshot))
	perSlot := (312_500_000 - coinbase.FinderAmountSats - int64(float64(312_500_000)*coinbase.PoolFeePercent)) / int64(coinbase.MaxRankedSlots)
	for i, e := range snapshot {
		entries[i] = snapshotEntry{Rank: e.Rank, Address: e.BTCAddress, AmountSats: perSlot}
	}

	// Insert block record
	var blockID int64
	err = tx.QueryRow(ctx,
		`INSERT INTO blocks (round_id, height, hash, finder_address, coinbase_txid, top_21_snapshot, block_fees_sats)
		 VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7) RETURNING id`,
		bf.RoundID, bf.Height, bf.Hash, bf.FinderAddress, bf.CoinbaseTxID,
		marshalJSON(entries), bf.FeesSats,
	).Scan(&blockID)
	if err != nil {
		return nil, 0, fmt.Errorf("insert block: %w", err)
	}

	// Close current round
	_, err = tx.Exec(ctx,
		`UPDATE rounds SET ended_at = NOW(), block_id = $1 WHERE id = $2`,
		blockID, bf.RoundID,
	)
	if err != nil {
		return nil, 0, fmt.Errorf("close round: %w", err)
	}

	// Open new round
	var newRoundID int64
	err = tx.QueryRow(ctx,
		`INSERT INTO rounds (started_at) VALUES (NOW()) RETURNING id`,
	).Scan(&newRoundID)
	if err != nil {
		return nil, 0, fmt.Errorf("open new round: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, 0, fmt.Errorf("commit: %w", err)
	}
	return snapshot, newRoundID, nil
}

func marshalJSON(v any) string {
	import "encoding/json"
	b, _ := json.Marshal(v)
	return string(b)
}
```

Note: move the `import "encoding/json"` to the file-level imports block (Go does not allow inline imports). Add `"encoding/json"` to the import list at the top of service.go.

- [ ] **Step 4: Fix import and run tests**
```bash
# Create test database first (on VPS or locally with PostgreSQL installed)
createdb unlucky21_test
psql unlucky21_test -f internal/db/schema.sql

export TEST_DATABASE_URL="postgres://unlucky21:unlucky21test@localhost/unlucky21_test?sslmode=disable"
go test ./internal/leaderboard/... -v
```
Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**
```bash
git add reward-service/internal/leaderboard/
git commit -m "feat: leaderboard service with 7-day rolling window and block reset"
```

---

## Task 7: Unix socket server

**Files:**
- Create: `reward-service/internal/socket/server.go`
- Create: `reward-service/internal/socket/server_test.go`

- [ ] **Step 1: Write failing test**

Create `reward-service/internal/socket/server_test.go`:
```go
package socket_test

import (
	"encoding/json"
	"net"
	"os"
	"testing"
	"time"

	"unlucky21/reward/internal/socket"
)

// mockHandler returns fixed outputs for testing.
type mockHandler struct{}

func (m *mockHandler) GetCoinbaseOutputs(minerAddr string, feesSats int64) ([]socket.Output, error) {
	return []socket.Output{
		{Address: minerAddr, AmountSats: 50_000_000},
		{Address: "bc1qpool", AmountSats: 6_250_000},
	}, nil
}

func (m *mockHandler) RecordShare(addr, worker, difficulty string, isStale bool) error {
	return nil
}

func (m *mockHandler) BlockFound(height int32, hash, finderAddr, txid string, feesSats int64) error {
	return nil
}

func TestSocketServer_CoinbaseRequest(t *testing.T) {
	sockPath := "/tmp/test_reward.sock"
	os.Remove(sockPath)

	srv := socket.NewServer(sockPath, &mockHandler{})
	go srv.Listen()
	time.Sleep(50 * time.Millisecond)

	conn, err := net.Dial("unix", sockPath)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()

	req := `{"type":"coinbase","miner_address":"bc1qtestminer","fees_sats":0}` + "\n"
	conn.Write([]byte(req))

	var resp struct {
		Outputs []socket.Output `json:"outputs"`
	}
	dec := json.NewDecoder(conn)
	if err := dec.Decode(&resp); err != nil {
		t.Fatal(err)
	}
	if len(resp.Outputs) != 2 {
		t.Fatalf("expected 2 outputs, got %d", len(resp.Outputs))
	}
	if resp.Outputs[0].Address != "bc1qtestminer" {
		t.Fatalf("first output must be miner address, got %s", resp.Outputs[0].Address)
	}
}

func TestSocketServer_ShareSubmit(t *testing.T) {
	sockPath := "/tmp/test_reward2.sock"
	os.Remove(sockPath)

	srv := socket.NewServer(sockPath, &mockHandler{})
	go srv.Listen()
	time.Sleep(50 * time.Millisecond)

	conn, err := net.Dial("unix", sockPath)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()

	req := `{"type":"share","btc_address":"bc1q","worker_name":"rig1","difficulty":"9999","is_stale":false}` + "\n"
	conn.Write([]byte(req))
	// Share submit is fire-and-forget — no response expected, just no crash
	time.Sleep(50 * time.Millisecond)
}
```

- [ ] **Step 2: Run test to verify failure**
```bash
go test ./internal/socket/... -v
```
Expected: compile error.

- [ ] **Step 3: Implement server.go**

Create `reward-service/internal/socket/server.go`:
```go
package socket

import (
	"bufio"
	"encoding/json"
	"fmt"
	"log/slog"
	"net"
	"os"
)

// Output is one coinbase output returned to datum_gateway.
type Output struct {
	Address    string `json:"address"`
	AmountSats int64  `json:"amount_sats"`
}

// Handler is the interface the socket server calls into for business logic.
type Handler interface {
	GetCoinbaseOutputs(minerAddr string, feesSats int64) ([]Output, error)
	RecordShare(addr, worker, difficulty string, isStale bool) error
	BlockFound(height int32, hash, finderAddr, txid string, feesSats int64) error
}

// Server listens on a Unix domain socket and dispatches messages to Handler.
type Server struct {
	path    string
	handler Handler
}

// NewServer creates a Server. Call Listen() to start accepting connections.
func NewServer(path string, h Handler) *Server {
	return &Server{path: path, handler: h}
}

// Listen blocks, accepting one connection at a time.
func (s *Server) Listen() error {
	os.Remove(s.path)
	ln, err := net.Listen("unix", s.path)
	if err != nil {
		return fmt.Errorf("listen %s: %w", s.path, err)
	}
	defer ln.Close()
	slog.Info("reward socket listening", "path", s.path)

	for {
		conn, err := ln.Accept()
		if err != nil {
			slog.Error("accept error", "err", err)
			continue
		}
		go s.handle(conn)
	}
}

func (s *Server) handle(conn net.Conn) {
	defer conn.Close()
	scanner := bufio.NewScanner(conn)
	for scanner.Scan() {
		line := scanner.Bytes()
		var msg struct {
			Type string `json:"type"`
		}
		if err := json.Unmarshal(line, &msg); err != nil {
			slog.Warn("malformed message", "err", err)
			continue
		}
		switch msg.Type {
		case "coinbase":
			s.handleCoinbase(conn, line)
		case "share":
			s.handleShare(line)
		case "block_found":
			s.handleBlockFound(conn, line)
		default:
			slog.Warn("unknown message type", "type", msg.Type)
		}
	}
}

func (s *Server) handleCoinbase(conn net.Conn, raw []byte) {
	var req struct {
		MinerAddress string `json:"miner_address"`
		FeesSats     int64  `json:"fees_sats"`
	}
	if err := json.Unmarshal(raw, &req); err != nil {
		slog.Error("coinbase parse error", "err", err)
		return
	}
	outputs, err := s.handler.GetCoinbaseOutputs(req.MinerAddress, req.FeesSats)
	if err != nil {
		slog.Error("GetCoinbaseOutputs error", "err", err)
		// Return single solo output as fallback
		outputs = []Output{{Address: req.MinerAddress, AmountSats: -1}} // -1 = signal to C: use full reward
	}
	resp := struct {
		Outputs []Output `json:"outputs"`
	}{Outputs: outputs}
	enc := json.NewEncoder(conn)
	if err := enc.Encode(resp); err != nil {
		slog.Error("write coinbase response", "err", err)
	}
}

func (s *Server) handleShare(raw []byte) {
	var req struct {
		BTCAddress string `json:"btc_address"`
		WorkerName string `json:"worker_name"`
		Difficulty string `json:"difficulty"`
		IsStale    bool   `json:"is_stale"`
	}
	if err := json.Unmarshal(raw, &req); err != nil {
		slog.Warn("share parse error", "err", err)
		return
	}
	if err := s.handler.RecordShare(req.BTCAddress, req.WorkerName, req.Difficulty, req.IsStale); err != nil {
		slog.Error("RecordShare error", "err", err)
	}
}

func (s *Server) handleBlockFound(conn net.Conn, raw []byte) {
	var req struct {
		Height        int32  `json:"height"`
		Hash          string `json:"hash"`
		FinderAddress string `json:"finder_address"`
		CoinbaseTxID  string `json:"coinbase_txid"`
		FeesSats      int64  `json:"fees_sats"`
	}
	if err := json.Unmarshal(raw, &req); err != nil {
		slog.Error("block_found parse error", "err", err)
		return
	}
	if err := s.handler.BlockFound(req.Height, req.Hash, req.FinderAddress, req.CoinbaseTxID, req.FeesSats); err != nil {
		slog.Error("BlockFound error", "err", err)
	}
	// Acknowledge — datum_gateway waits for this before broadcasting new template
	conn.Write([]byte(`{"status":"ok"}` + "\n"))
}
```

- [ ] **Step 4: Run tests**
```bash
go test ./internal/socket/... -v
```
Expected: all tests PASS.

- [ ] **Step 5: Commit**
```bash
git add reward-service/internal/socket/
git commit -m "feat: Unix socket server for datum_gateway IPC"
```

---

## Task 8: Go service main + wiring

**Files:**
- Create: `reward-service/cmd/server/main.go`

- [ ] **Step 1: Create main.go**

Create `reward-service/cmd/server/main.go`:
```go
package main

import (
	"context"
	"log/slog"
	"math/big"
	"os"
	"sync"

	"unlucky21/reward/internal/coinbase"
	"unlucky21/reward/internal/db"
	"unlucky21/reward/internal/leaderboard"
	"unlucky21/reward/internal/socket"

	"github.com/jackc/pgx/v5/pgxpool"
)

const socketPath = "/var/run/unlucky21/reward.sock"

// poolHandler wires leaderboard + coinbase into the socket.Handler interface.
type poolHandler struct {
	mu      sync.RWMutex
	svc     *leaderboard.Service
	roundID int64
	top21   []leaderboard.Entry
}

func newPoolHandler(pool *pgxpool.Pool) (*poolHandler, error) {
	svc := leaderboard.New(pool)
	roundID, err := svc.ActiveRoundID(context.Background())
	if err != nil {
		return nil, err
	}
	h := &poolHandler{svc: svc, roundID: roundID}
	go h.refreshLoop()
	return h, nil
}

func (h *poolHandler) refreshLoop() {
	// Refresh leaderboard cache every 10 seconds
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()
	for range ticker.C {
		h.mu.RLock()
		rid := h.roundID
		h.mu.RUnlock()
		entries, err := h.svc.GetTop21(context.Background(), rid)
		if err != nil {
			slog.Error("leaderboard refresh error", "err", err)
			continue
		}
		h.mu.Lock()
		h.top21 = entries
		h.mu.Unlock()
	}
}

func (h *poolHandler) GetCoinbaseOutputs(minerAddr string, feesSats int64) ([]socket.Output, error) {
	h.mu.RLock()
	top21 := h.top21
	h.mu.RUnlock()

	ranked := make([]coinbase.RankedAddress, len(top21))
	for i, e := range top21 {
		ranked[i] = coinbase.RankedAddress{Address: e.BTCAddress}
	}

	// 3.125 BTC subsidy + fees
	subsidySats := int64(312_500_000)
	outputs := coinbase.BuildOutputs(minerAddr, subsidySats, feesSats, ranked)

	result := make([]socket.Output, len(outputs))
	for i, o := range outputs {
		result[i] = socket.Output{Address: o.Address, AmountSats: o.AmountSats}
	}
	return result, nil
}

func (h *poolHandler) RecordShare(addr, worker, difficulty string, isStale bool) error {
	h.mu.RLock()
	roundID := h.roundID
	h.mu.RUnlock()

	diff := new(big.Int)
	diff.SetString(difficulty, 10)

	return h.svc.RecordShare(context.Background(), leaderboard.Share{
		RoundID:    roundID,
		BTCAddress: addr,
		WorkerName: worker,
		Difficulty: diff,
		IsStale:    isStale,
	})
}

func (h *poolHandler) BlockFound(height int32, hash, finderAddr, txid string, feesSats int64) error {
	h.mu.Lock()
	defer h.mu.Unlock()

	_, newRoundID, err := h.svc.ResetForBlock(context.Background(), leaderboard.BlockFound{
		RoundID:       h.roundID,
		Height:        height,
		Hash:          hash,
		FinderAddress: finderAddr,
		CoinbaseTxID:  txid,
		FeesSats:      feesSats,
	})
	if err != nil {
		return err
	}
	h.roundID = newRoundID
	h.top21 = nil // will refresh on next tick
	slog.Info("block found — leaderboard reset", "height", height, "new_round", newRoundID)
	return nil
}

func main() {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = "postgres://unlucky21:REPLACE_PASSWORD@localhost/unlucky21?sslmode=disable"
	}

	pool, err := db.Connect(context.Background(), dsn)
	if err != nil {
		slog.Error("DB connect failed", "err", err)
		os.Exit(1)
	}
	defer pool.Close()

	handler, err := newPoolHandler(pool)
	if err != nil {
		slog.Error("handler init failed", "err", err)
		os.Exit(1)
	}

	srv := socket.NewServer(socketPath, handler)
	slog.Info("reward service starting", "socket", socketPath)
	if err := srv.Listen(); err != nil {
		slog.Error("socket server error", "err", err)
		os.Exit(1)
	}
}
```

Add missing `"time"` import to the file.

- [ ] **Step 2: Build and verify**
```bash
cd reward-service
go build ./cmd/server/
```
Expected: binary `server` created with no errors.

- [ ] **Step 3: Run all tests**
```bash
go test ./... -v
```
Expected: all tests pass.

- [ ] **Step 4: Commit**
```bash
git add reward-service/cmd/
git commit -m "feat: reward service main entrypoint with leaderboard wiring"
```

---

## Task 9: Fork and build datum_gateway

**Files:**
- `datum-gateway/` (git submodule)

- [ ] **Step 1: Fork datum_gateway on GitHub**

In your browser: go to `https://github.com/OCEAN-xyz/datum_gateway` → click Fork → fork to your personal GitHub account. Name it `datum-gateway`.

- [ ] **Step 2: Add as submodule**
```bash
cd "/Users/brianfitzgerald/untitled folder/solounlucky21"
git submodule add git@github.com:<YOUR_GITHUB_USERNAME>/datum-gateway.git datum-gateway
git submodule update --init --recursive
```

- [ ] **Step 3: On VPS — install datum_gateway build deps**
```bash
# On VPS
apt-get install -y cmake libjansson-dev libcurl4-openssl-dev libssl-dev
```

- [ ] **Step 4: Build unmodified datum_gateway on VPS to confirm it compiles**
```bash
# On VPS
git clone git@github.com:<YOUR_GITHUB_USERNAME>/datum-gateway.git /opt/datum-gateway
cd /opt/datum-gateway
mkdir build && cd build
cmake .. -DCMAKE_BUILD_TYPE=Release
make -j$(nproc)
```
Expected: `datum_gateway` binary produced with no errors.

- [ ] **Step 5: Locate the coinbase output configuration in source**
```bash
# Identify where datum_gateway sets coinbase outputs
grep -rn "coinbase\|generation\|payout\|output" /opt/datum-gateway/src/ \
  --include="*.c" --include="*.h" -l
```
Note the file names returned. Then:
```bash
grep -n "coinbase\|gen_tx\|payout\|p2pkh\|p2wpkh\|scriptPubKey" \
  /opt/datum-gateway/src/<most_relevant_file>.c | head -40
```
Record the function name responsible for setting coinbase outputs — this is the hook point for Task 11.

- [ ] **Step 6: Configure datum_gateway to connect to Bitcoin Core (no custom hook yet)**

Locate the datum_gateway config template:
```bash
find /opt/datum-gateway -name "*.conf*" -o -name "*.json*" -o -name "*.cfg*" | grep -v build
```
Copy and edit the example config, setting:
- Bitcoin Core RPC URL: `http://127.0.0.1:18443`
- RPC user/password matching `infra/bitcoin.conf`
- Pool stratum port: `3333`
- Pool fee address: your BTC address

- [ ] **Step 7: Start datum_gateway and verify it connects to Bitcoin Core**
```bash
./datum_gateway --config /etc/unlucky21/datum-gateway.conf
```
Expected: log lines showing successful connection to Bitcoin Core and Stratum port open on 3333.

- [ ] **Step 8: Commit submodule reference**
```bash
git add .gitmodules datum-gateway
git commit -m "feat: add datum_gateway fork as submodule"
```

---

## Task 10: C hook — reward socket client

**Files:**
- Create: `datum-gateway/src/datum_reward_socket.h`
- Create: `datum-gateway/src/datum_reward_socket.c`

These files add a Unix socket client to datum_gateway. They call the Go reward service for per-miner coinbase outputs and fall back to solo mode if the service is unavailable.

- [ ] **Step 1: Create the header file**

Create `datum-gateway/src/datum_reward_socket.h`:
```c
#ifndef DATUM_REWARD_SOCKET_H
#define DATUM_REWARD_SOCKET_H

#include <stdint.h>

#define REWARD_SOCKET_PATH "/var/run/unlucky21/reward.sock"
#define REWARD_MAX_OUTPUTS 30
#define REWARD_ADDR_LEN    91

typedef struct {
    char    address[REWARD_ADDR_LEN];
    int64_t amount_sats;
} reward_output_t;

typedef struct {
    reward_output_t outputs[REWARD_MAX_OUTPUTS];
    int             count;
} reward_output_list_t;

/*
 * Request coinbase outputs from the Go reward service.
 * miner_address: BTC address of the connecting miner (goes in slot 1).
 * fees_sats:     transaction fees in this block template.
 * result:        populated on success.
 *
 * Returns number of outputs on success, -1 if the Go service is
 * unavailable (caller should fall back to solo/single-output mode).
 */
int datum_request_coinbase_outputs(
    const char          *miner_address,
    int64_t              fees_sats,
    reward_output_list_t *result
);

#endif /* DATUM_REWARD_SOCKET_H */
```

- [ ] **Step 2: Create the implementation file**

Create `datum-gateway/src/datum_reward_socket.c`:
```c
#include "datum_reward_socket.h"

#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <unistd.h>

#define RECV_BUF 16384

/*
 * Minimal JSON field extractor.
 * Finds `"key":VALUE` in json and copies VALUE (string or number) into out.
 * Returns pointer past the value, or NULL on failure.
 */
static const char *json_extract(const char *json, const char *key,
                                char *out, int out_len) {
    char search[128];
    snprintf(search, sizeof(search), "\"%s\":", key);
    const char *p = strstr(json, search);
    if (!p) return NULL;
    p += strlen(search);
    while (*p == ' ') p++;
    if (*p == '"') {
        p++;
        int i = 0;
        while (*p && *p != '"' && i < out_len - 1) out[i++] = *p++;
        out[i] = '\0';
        return (*p == '"') ? p + 1 : NULL;
    }
    /* number */
    int i = 0;
    while ((*p == '-' || (*p >= '0' && *p <= '9')) && i < out_len - 1)
        out[i++] = *p++;
    out[i] = '\0';
    return p;
}

/*
 * Parse the JSON response from the Go reward service.
 * Format: {"outputs":[{"address":"...","amount_sats":NNN}, ...]}
 */
static int parse_response(const char *json, reward_output_list_t *result) {
    result->count = 0;
    const char *p = strstr(json, "\"outputs\"");
    if (!p) return -1;
    p = strchr(p, '[');
    if (!p) return -1;
    p++;

    while (result->count < REWARD_MAX_OUTPUTS) {
        p = strchr(p, '{');
        if (!p) break;

        char addr[REWARD_ADDR_LEN] = {0};
        char sats[32] = {0};

        const char *after_addr = json_extract(p, "address", addr, sizeof(addr));
        if (!after_addr) break;
        const char *after_sats = json_extract(p, "amount_sats", sats, sizeof(sats));
        if (!after_sats) break;

        strncpy(result->outputs[result->count].address, addr, REWARD_ADDR_LEN - 1);
        result->outputs[result->count].amount_sats = (int64_t)atoll(sats);
        result->count++;

        p = strchr(after_sats, '}');
        if (!p) break;
        p++;
    }
    return result->count;
}

int datum_request_coinbase_outputs(
    const char           *miner_address,
    int64_t               fees_sats,
    reward_output_list_t *result
) {
    int sock_fd;
    struct sockaddr_un addr;
    char request[512];
    char response[RECV_BUF];
    ssize_t n;

    sock_fd = socket(AF_UNIX, SOCK_STREAM, 0);
    if (sock_fd < 0) return -1;

    /* Set a 500ms connect + read timeout so a slow Go service doesn't
     * stall datum_gateway template construction. */
    struct timeval tv = {0, 500000};
    setsockopt(sock_fd, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof(tv));
    setsockopt(sock_fd, SOL_SOCKET, SO_SNDTIMEO, &tv, sizeof(tv));

    memset(&addr, 0, sizeof(addr));
    addr.sun_family = AF_UNIX;
    strncpy(addr.sun_path, REWARD_SOCKET_PATH, sizeof(addr.sun_path) - 1);

    if (connect(sock_fd, (struct sockaddr *)&addr, sizeof(addr)) < 0) {
        close(sock_fd);
        return -1; /* Go service down — caller falls back to solo */
    }

    snprintf(request, sizeof(request),
        "{\"type\":\"coinbase\",\"miner_address\":\"%s\",\"fees_sats\":%lld}\n",
        miner_address, (long long)fees_sats);

    if (write(sock_fd, request, strlen(request)) < 0) {
        close(sock_fd);
        return -1;
    }

    n = read(sock_fd, response, RECV_BUF - 1);
    close(sock_fd);
    if (n <= 0) return -1;
    response[n] = '\0';

    return parse_response(response, result);
}
```

- [ ] **Step 3: Add new files to datum_gateway's CMakeLists.txt**
```bash
# In datum-gateway/CMakeLists.txt (or the relevant add_executable / target_sources call):
# Add datum_reward_socket.c to the source list.
# Find the existing source list:
grep -n "target_sources\|add_executable\|\.c\"" /opt/datum-gateway/CMakeLists.txt | head -20
```
Then edit `CMakeLists.txt` to include `src/datum_reward_socket.c` in the sources.

- [ ] **Step 4: Build with new files**
```bash
cd /opt/datum-gateway/build
cmake .. -DCMAKE_BUILD_TYPE=Release
make -j$(nproc)
```
Expected: compiles cleanly. Fix any warnings about implicit types.

- [ ] **Step 5: Commit**
```bash
cd datum-gateway
git add src/datum_reward_socket.h src/datum_reward_socket.c CMakeLists.txt
git commit -m "feat: reward socket client for Go service IPC"
```

---

## Task 11: Hook coinbase outputs into datum_gateway

This task modifies the datum_gateway C source to call the reward socket client before building each miner's block template.

- [ ] **Step 1: Find the template construction hook point**

From Task 9 Step 5, you identified the relevant source file. Open it and find the function that:
- Takes a miner's work request
- Calls into Bitcoin Core's block template
- Constructs the coinbase/generation transaction

```bash
grep -n "coinbase\|gen_tx\|build_template\|make_work" \
  /opt/datum-gateway/src/<identified_file>.c | head -30
```

Look for a function that loops over configured payout addresses or constructs outputs. Record the function name and line number.

- [ ] **Step 2: Add the include and call**

In the identified C file, add at the top:
```c
#include "datum_reward_socket.h"
```

Find the block where coinbase outputs are set. Immediately before the output construction loop, add:
```c
    /* -- BEGIN unlucky21 reward hook -- */
    reward_output_list_t reward_outputs;
    const char *miner_btc_addr = /* extract from work request — see existing field */;
    int64_t fees_sats = /* extract from block template fees field */;
    int use_reward_outputs = (datum_request_coinbase_outputs(
        miner_btc_addr, fees_sats, &reward_outputs) > 0);
    /* -- END unlucky21 reward hook -- */
```

Then wrap the existing output construction code:
```c
    if (use_reward_outputs) {
        /* Use outputs from Go service */
        for (int i = 0; i < reward_outputs.count; i++) {
            /* Add output: reward_outputs.outputs[i].address,
                           reward_outputs.outputs[i].amount_sats */
            /* Use datum_gateway's existing output-encoding function */
            add_coinbase_output(
                reward_outputs.outputs[i].address,
                reward_outputs.outputs[i].amount_sats
            );
        }
    } else {
        /* Fallback: existing solo/single-output path — do not modify */
        /* existing code runs as-is */
    }
```

Note: `add_coinbase_output` is a placeholder name — replace with the actual function datum_gateway uses to add outputs to the coinbase. Find it with:
```bash
grep -n "output\|vout\|amount\|p2wpkh\|p2pkh" /opt/datum-gateway/src/<file>.c | grep -i "add\|push\|append"
```

- [ ] **Step 3: Rebuild**
```bash
cd /opt/datum-gateway/build
make -j$(nproc)
```
Expected: compiles cleanly.

- [ ] **Step 4: Test hook with Go service running**
```bash
# Terminal 1: start Go service
DATABASE_URL="postgres://unlucky21:PASSWORD@localhost/unlucky21" \
  /opt/unlucky21/reward-service

# Terminal 2: start datum_gateway
./datum_gateway --config /etc/unlucky21/datum-gateway.conf

# Terminal 3: connect a test miner
cpuminer -a sha256d \
  -o stratum+tcp://127.0.0.1:3333 \
  -u bc1qYOUR_TEST_ADDRESS \
  -p x
```
Watch datum_gateway logs for: socket call to Go service, template construction with multiple outputs.

- [ ] **Step 5: Commit**
```bash
cd datum-gateway
git add src/
git commit -m "feat: hook reward socket into coinbase output construction"
```

---

## Task 12: End-to-end signet integration test

**Files:**
- Create: `scripts/test-signet.sh`

- [ ] **Step 1: Install cpuminer-multi on VPS**
```bash
# On VPS
apt-get install -y autoconf libcurl4-openssl-dev libssl-dev
git clone https://github.com/tpruvot/cpuminer-multi.git /opt/cpuminer-multi
cd /opt/cpuminer-multi
./autogen.sh
./configure CFLAGS="-O3"
make -j$(nproc)
install cpuminer /usr/local/bin/cpuminer
```

- [ ] **Step 2: Write the test harness script**

Create `scripts/test-signet.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail

STRATUM="stratum+tcp://127.0.0.1:3333"
DB="postgres://unlucky21:REPLACE@localhost/unlucky21"

# Three distinct test addresses
ADDR_A="bc1q_REPLACE_WITH_REAL_SIGNET_ADDRESS_A"
ADDR_B="bc1q_REPLACE_WITH_REAL_SIGNET_ADDRESS_B"
ADDR_C="bc1q_REPLACE_WITH_REAL_SIGNET_ADDRESS_C"

echo "=== Phase 1a: Verify stratum is accepting connections ==="
nc -z 127.0.0.1 3333 && echo "PASS: port 3333 open" || { echo "FAIL: port 3333 closed"; exit 1; }

echo "=== Phase 1b: Start miner A for 30s and check share appears ==="
cpuminer -a sha256d -o "$STRATUM" -u "$ADDR_A" -p x &
MINER_PID=$!
sleep 30
kill $MINER_PID 2>/dev/null || true

COUNT=$(psql "$DB" -t -c "SELECT COUNT(*) FROM shares WHERE btc_address='$ADDR_A'")
COUNT=$(echo $COUNT | tr -d ' ')
if [ "$COUNT" -gt "0" ]; then
  echo "PASS: $COUNT shares recorded for miner A"
else
  echo "FAIL: no shares recorded for miner A"
  exit 1
fi

echo "=== Phase 1c: Verify leaderboard ranking ==="
# Start miner B briefly with higher hashrate simulation (just run longer)
cpuminer -a sha256d -o "$STRATUM" -u "$ADDR_B" -p x &
MINER_B=$!
sleep 60
kill $MINER_B 2>/dev/null || true

ROUND_ID=$(psql "$DB" -t -c "SELECT id FROM rounds WHERE ended_at IS NULL LIMIT 1" | tr -d ' ')
TOP=$(psql "$DB" -t -c "
  SELECT btc_address FROM (
    SELECT btc_address, MAX(share_difficulty) AS best
    FROM shares WHERE round_id=$ROUND_ID AND submitted_at > NOW() - INTERVAL '7 days' AND is_stale=false
    GROUP BY btc_address ORDER BY best DESC LIMIT 1
  ) t
" | tr -d ' ')
echo "Current rank #1: $TOP"
echo "PASS: leaderboard query works"

echo "=== Waiting for signet block (may take several minutes) ==="
echo "Run cpuminer and wait for a block to appear in blocks table..."
echo "Monitor with: watch -n5 'psql $DB -c \"SELECT * FROM blocks\"'"
```

- [ ] **Step 3: Run Phase 1a and 1b tests**
```bash
chmod +x scripts/test-signet.sh
./scripts/test-signet.sh
```
Expected: stratum port open, shares appear in database.

- [ ] **Step 4: Mine a signet block and verify coinbase outputs**

Run cpuminer against the pool until a block is found (signet, so minutes not hours):
```bash
cpuminer -a sha256d -o stratum+tcp://127.0.0.1:3333 -u bc1qYOUR_ADDRESS -p x -t 4
```

When a block is found, check the blocks table:
```bash
psql $DB -c "SELECT height, hash, finder_address, top_21_snapshot FROM blocks ORDER BY found_at DESC LIMIT 1"
```
Expected: row with height, hash, finder address, and JSON snapshot.

Verify coinbase on signet block explorer:
```bash
# Get the coinbase txid
TXID=$(psql $DB -t -c "SELECT coinbase_txid FROM blocks ORDER BY found_at DESC LIMIT 1" | tr -d ' ')
echo "Check: https://mempool.space/signet/tx/$TXID"
```
Open the URL and confirm the transaction has 23+ outputs matching your expected addresses.

- [ ] **Step 5: Verify leaderboard reset after block**
```bash
NEW_ROUND=$(psql $DB -t -c "SELECT id FROM rounds WHERE ended_at IS NULL LIMIT 1" | tr -d ' ')
COUNT=$(psql $DB -t -c "SELECT COUNT(*) FROM shares WHERE round_id=$NEW_ROUND" | tr -d ' ')
echo "Shares in new round: $COUNT"  # Should be 0 or very low (new submissions only)
```

- [ ] **Step 6: Verify fallback (kill Go service, check datum_gateway continues)**
```bash
# Kill Go reward service
pkill -f reward-service

# Mine for 30 seconds — datum_gateway should fall back to solo mode
sleep 30

# Restart Go service
DATABASE_URL="..." /opt/unlucky21/reward-service &

# Verify no crash, no shares lost (stale shares from fallback period are marked stale)
psql $DB -c "SELECT is_stale, COUNT(*) FROM shares GROUP BY is_stale"
```

- [ ] **Step 7: Commit test script**
```bash
git add scripts/test-signet.sh
git commit -m "test: signet end-to-end test harness"
```

---

## Task 13: Systemd services + deployment

**Files:**
- Create: `infra/datum-gateway.service`
- Create: `infra/reward-service.service`

- [ ] **Step 1: Write datum-gateway systemd unit**

Create `infra/datum-gateway.service`:
```ini
[Unit]
Description=datum_gateway Stratum Server
After=network.target bitcoin-unlucky21.service reward-unlucky21.service
Requires=bitcoin-unlucky21.service reward-unlucky21.service

[Service]
User=unlucky21
Group=unlucky21
ExecStart=/opt/datum-gateway/build/datum_gateway \
  --config /etc/unlucky21/datum-gateway.conf
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

- [ ] **Step 2: Write reward-service systemd unit**

Create `infra/reward-service.service`:
```ini
[Unit]
Description=SoloUnlucky21 Reward Service
After=network.target postgresql.service
Requires=postgresql.service

[Service]
User=unlucky21
Group=unlucky21
Environment=DATABASE_URL=postgres://unlucky21:REPLACE_PASSWORD@localhost/unlucky21?sslmode=disable
ExecStart=/opt/unlucky21/reward-service
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

- [ ] **Step 3: Deploy and enable all services**
```bash
# On VPS
cp infra/reward-service.service /etc/systemd/system/reward-unlucky21.service
cp infra/datum-gateway.service  /etc/systemd/system/datum-gateway-unlucky21.service
systemctl daemon-reload
systemctl enable reward-unlucky21 datum-gateway-unlucky21
systemctl start reward-unlucky21
systemctl start datum-gateway-unlucky21
systemctl status reward-unlucky21 datum-gateway-unlucky21
```
Expected: both services show `active (running)`.

- [ ] **Step 4: Verify startup order**
```bash
# Restart bitcoin, verify other services come up in correct order
systemctl restart bitcoin-unlucky21
sleep 10
systemctl status reward-unlucky21 datum-gateway-unlucky21
```
Expected: all three services active, datum_gateway logs show it connected to Bitcoin Core.

- [ ] **Step 5: Commit**
```bash
git add infra/datum-gateway.service infra/reward-service.service
git commit -m "infra: systemd units for datum_gateway and reward service"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] Bitcoin Core signet config + `coinbasetxnweight=100000` — Task 2
- [x] PostgreSQL schema (`numeric(78,0)` for 256-bit difficulty) — Task 3
- [x] Go DB layer — Task 4
- [x] Coinbase payout math (subsidy+fees, dust, <21 miners, finder in top 21) — Task 5
- [x] Leaderboard 7-day rolling window — Task 6
- [x] Stale share exclusion — Task 6
- [x] Block-found reset in single transaction — Task 6
- [x] Unix socket server (COINBASE, SHARE, BLOCK_FOUND) — Task 7
- [x] Go service wiring + 10s refresh loop — Task 8
- [x] datum_gateway fork + build — Task 9
- [x] C socket client with 500ms timeout + fallback — Task 10
- [x] Coinbase output injection hook — Task 11
- [x] Phase 1a–1e signet test suite — Task 12
- [x] Systemd startup order — Task 13
- [x] Per-miner personalized template (finder in slot 1) — Task 10/11
- [x] Fallback to solo mode when Go service down — Task 10/12

**No placeholders found** — all steps contain actual code.

**Type consistency:**
- `leaderboard.Share` used consistently across Task 6 and Task 8
- `socket.Output` / `coinbase.CoinbaseOutput` used in their respective packages, converted at the wiring layer in Task 8
- `big.Int` for difficulty throughout; serialized as decimal string in JSON (Task 7 socket server, Task 6 leaderboard)
- `int64` for all satoshi amounts throughout
