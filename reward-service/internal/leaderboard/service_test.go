package leaderboard_test

import (
	"context"
	"math/big"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"unlucky21/reward/internal/db"
	"unlucky21/reward/internal/leaderboard"
)

const defaultTestDSN = "postgres://unlucky21:unlucky21test@localhost/unlucky21_test?sslmode=disable"

func testDB(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		dsn = defaultTestDSN
	}
	ctx := context.Background()
	pool, err := db.Connect(ctx, dsn)
	if err != nil {
		t.Skipf("skipping: cannot connect to test database: %v", err)
	}
	t.Cleanup(func() {
		// Truncate in FK-safe order; CASCADE handles any remaining references.
		_, _ = pool.Exec(context.Background(), `TRUNCATE shares CASCADE`)
		_, _ = pool.Exec(context.Background(), `TRUNCATE blocks CASCADE`)
		_, _ = pool.Exec(context.Background(), `TRUNCATE rounds CASCADE`)
		// Re-insert bootstrap round so the next test starts clean.
		_, _ = pool.Exec(context.Background(),
			`INSERT INTO rounds (started_at) VALUES (NOW())`)
		pool.Close()
	})
	return pool
}

// activeRoundID is a convenience wrapper for tests.
func activeRoundID(t *testing.T, pool *pgxpool.Pool) int64 {
	t.Helper()
	id, err := db.ActiveRoundID(context.Background(), pool)
	if err != nil {
		t.Fatalf("activeRoundID: %v", err)
	}
	return id
}

// TestRecordShare_AppearsInLeaderboard records one share and verifies GetTop21
// returns it with the correct address and difficulty.
func TestRecordShare_AppearsInLeaderboard(t *testing.T) {
	pool := testDB(t)
	svc := leaderboard.New(pool)
	ctx := context.Background()

	roundID := activeRoundID(t, pool)

	sh := leaderboard.Share{
		RoundID:    roundID,
		BTCAddress: "bc1qtest0001",
		WorkerName: "rig0",
		Difficulty: big.NewInt(999_999),
	}
	if err := svc.RecordShare(ctx, sh); err != nil {
		t.Fatalf("RecordShare: %v", err)
	}

	entries, err := svc.GetTop21(ctx, roundID)
	if err != nil {
		t.Fatalf("GetTop21: %v", err)
	}
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(entries))
	}
	if entries[0].BTCAddress != "bc1qtest0001" {
		t.Errorf("address: got %q, want %q", entries[0].BTCAddress, "bc1qtest0001")
	}
	want := big.NewInt(999_999)
	if entries[0].BestShareDifficulty.Cmp(want) != 0 {
		t.Errorf("difficulty: got %s, want %s", entries[0].BestShareDifficulty, want)
	}
}

// TestGetTop21_RankedByBestShare verifies that the leaderboard ranks addresses
// by their MAX share difficulty, not submission order.
func TestGetTop21_RankedByBestShare(t *testing.T) {
	pool := testDB(t)
	svc := leaderboard.New(pool)
	ctx := context.Background()
	roundID := activeRoundID(t, pool)

	// Address A submits two shares: 3000 then 5000 → best = 5000.
	for _, diff := range []int64{3000, 5000} {
		if err := svc.RecordShare(ctx, leaderboard.Share{
			RoundID:    roundID,
			BTCAddress: "bc1qaddrA",
			WorkerName: "rigA",
			Difficulty: big.NewInt(diff),
		}); err != nil {
			t.Fatalf("RecordShare A diff=%d: %v", diff, err)
		}
	}

	// Address B submits one share: 8000 → best = 8000.
	if err := svc.RecordShare(ctx, leaderboard.Share{
		RoundID:    roundID,
		BTCAddress: "bc1qaddrB",
		WorkerName: "rigB",
		Difficulty: big.NewInt(8000),
	}); err != nil {
		t.Fatalf("RecordShare B: %v", err)
	}

	entries, err := svc.GetTop21(ctx, roundID)
	if err != nil {
		t.Fatalf("GetTop21: %v", err)
	}
	if len(entries) != 2 {
		t.Fatalf("expected 2 entries, got %d", len(entries))
	}

	// B must be rank 1 with difficulty 8000.
	if entries[0].BTCAddress != "bc1qaddrB" {
		t.Errorf("rank 1 address: got %q, want %q", entries[0].BTCAddress, "bc1qaddrB")
	}
	if entries[0].Rank != 1 {
		t.Errorf("rank 1 rank field: got %d, want 1", entries[0].Rank)
	}
	wantB := big.NewInt(8000)
	if entries[0].BestShareDifficulty.Cmp(wantB) != 0 {
		t.Errorf("rank 1 difficulty: got %s, want %s", entries[0].BestShareDifficulty, wantB)
	}

	// A must be rank 2 with difficulty 5000 (the max of its two shares).
	if entries[1].BTCAddress != "bc1qaddrA" {
		t.Errorf("rank 2 address: got %q, want %q", entries[1].BTCAddress, "bc1qaddrA")
	}
	wantA := big.NewInt(5000)
	if entries[1].BestShareDifficulty.Cmp(wantA) != 0 {
		t.Errorf("rank 2 difficulty: got %s, want %s", entries[1].BestShareDifficulty, wantA)
	}
}

// TestGetTop21_SevenDayExpiry verifies that shares submitted more than 7 days
// ago are excluded from the leaderboard, even within the same round.
func TestGetTop21_SevenDayExpiry(t *testing.T) {
	pool := testDB(t)
	svc := leaderboard.New(pool)
	ctx := context.Background()
	roundID := activeRoundID(t, pool)

	// Insert a share via raw SQL with a submitted_at 8 days in the past.
	eightDaysAgo := time.Now().UTC().Add(-8 * 24 * time.Hour)
	_, err := pool.Exec(ctx,
		`INSERT INTO shares (round_id, btc_address, worker_name, share_difficulty, submitted_at, is_stale)
		 VALUES ($1, $2, $3, $4, $5, false)`,
		roundID, "bc1qstale_old", "old_rig", "123456789", eightDaysAgo,
	)
	if err != nil {
		t.Fatalf("raw insert old share: %v", err)
	}

	entries, err := svc.GetTop21(ctx, roundID)
	if err != nil {
		t.Fatalf("GetTop21: %v", err)
	}
	for _, e := range entries {
		if e.BTCAddress == "bc1qstale_old" {
			t.Errorf("expected old share to be excluded by 7-day window, but found it in leaderboard")
		}
	}
	if len(entries) != 0 {
		t.Errorf("expected empty leaderboard after expiry, got %d entries", len(entries))
	}
}

// TestGetTop21_StaleSharesExcluded verifies that shares marked is_stale=true
// do not appear in the leaderboard.
func TestGetTop21_StaleSharesExcluded(t *testing.T) {
	pool := testDB(t)
	svc := leaderboard.New(pool)
	ctx := context.Background()
	roundID := activeRoundID(t, pool)

	// RecordShare always inserts non-stale; use raw SQL to simulate a stale share.
	_, err := pool.Exec(ctx,
		`INSERT INTO shares (round_id, btc_address, worker_name, share_difficulty, is_stale)
		 VALUES ($1, $2, $3, $4::NUMERIC, true)`,
		roundID, "bc1qstale_addr", "stale_rig", "9999999",
	)
	if err != nil {
		t.Fatalf("insert stale share: %v", err)
	}

	entries, err := svc.GetTop21(ctx, roundID)
	if err != nil {
		t.Fatalf("GetTop21: %v", err)
	}
	for _, e := range entries {
		if e.BTCAddress == "bc1qstale_addr" {
			t.Errorf("stale share should not appear in leaderboard but did")
		}
	}
	if len(entries) != 0 {
		t.Errorf("expected empty leaderboard with only stale shares, got %d entries", len(entries))
	}
}

// TestResetForBlock_ClearsLeaderboard records shares in the current round,
// triggers a block-found event, then verifies:
//   - The new round has an empty leaderboard.
//   - The old round's block record exists and has a non-empty snapshot.
func TestResetForBlock_ClearsLeaderboard(t *testing.T) {
	pool := testDB(t)
	svc := leaderboard.New(pool)
	ctx := context.Background()
	oldRoundID := activeRoundID(t, pool)

	// Record a couple of shares in the current round.
	for _, addr := range []string{"bc1qminer1", "bc1qminer2"} {
		if err := svc.RecordShare(ctx, leaderboard.Share{
			RoundID:    oldRoundID,
			BTCAddress: addr,
			WorkerName: "rig",
			Difficulty: big.NewInt(77_000_000),
		}); err != nil {
			t.Fatalf("RecordShare %s: %v", addr, err)
		}
	}

	bf := leaderboard.BlockFound{
		RoundID:       oldRoundID,
		Height:        840_000,
		Hash:          "000000000000000000025c67fbf8f0c1e3c72f9b8bfca01b0b6d1234567890ab",
		FinderAddress: "bc1qfinder",
		CoinbaseTxID:  "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
		FeesSats:      100_000,
	}

	newBlockID, err := svc.RecordUnconfirmedBlock(ctx, bf)
	if err != nil {
		t.Fatalf("RecordUnconfirmedBlock: %v", err)
	}
	newRoundID, err := svc.ConfirmBlock(ctx, newBlockID)
	if err != nil {
		t.Fatalf("ConfirmBlock: %v", err)
	}

	// New round must differ from old round.
	if newRoundID == oldRoundID {
		t.Errorf("new round ID must differ from old: both are %d", newRoundID)
	}
	if newRoundID <= 0 {
		t.Errorf("invalid new round ID: %d", newRoundID)
	}

	// New round leaderboard must be empty.
	newEntries, err := svc.GetTop21(ctx, newRoundID)
	if err != nil {
		t.Fatalf("GetTop21 new round: %v", err)
	}
	if len(newEntries) != 0 {
		t.Errorf("new round should have empty leaderboard, got %d entries", len(newEntries))
	}

	// Old round must have been closed with a block record.
	var endedAt *time.Time
	var blockID *int64
	err = pool.QueryRow(ctx,
		`SELECT ended_at, block_id FROM rounds WHERE id = $1`, oldRoundID,
	).Scan(&endedAt, &blockID)
	if err != nil {
		t.Fatalf("query old round: %v", err)
	}
	if endedAt == nil {
		t.Error("old round ended_at should be set after block found")
	}
	if blockID == nil {
		t.Error("old round block_id should be set after block found")
	}

	// Verify the block record exists and snapshot JSON is non-empty.
	var snapshotJSON []byte
	err = pool.QueryRow(ctx,
		`SELECT top_21_snapshot FROM blocks WHERE id = $1`, *blockID,
	).Scan(&snapshotJSON)
	if err != nil {
		t.Fatalf("query block record: %v", err)
	}
	if len(snapshotJSON) == 0 || string(snapshotJSON) == "null" || string(snapshotJSON) == "[]" {
		t.Errorf("block top_21_snapshot should be non-empty JSON, got: %s", snapshotJSON)
	}
}
