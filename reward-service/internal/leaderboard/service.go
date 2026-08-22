package leaderboard

import (
	"context"
	"encoding/json"
	"fmt"
	"math/big"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"unlucky21/reward/internal/coinbase"
	"unlucky21/reward/internal/db"
)

// Share is a single share submission.
type Share struct {
	RoundID    int64
	BTCAddress string
	WorkerName string
	Difficulty *big.Int // must not be nil
	TrueDiff   float64
	SourcePort int
}

// Entry is one ranked row in the leaderboard.
type Entry struct {
	BTCAddress          string
	BestShareDifficulty *big.Int
	LastActivity        time.Time
	Rank                int
}

// BlockFound carries the data for a block-found event.
type BlockFound struct {
	RoundID       int64
	Height        int32
	Hash          string
	FinderAddress string
	CoinbaseTxID  string
	FeesSats      int64
}

// Service manages share ingestion and the rolling leaderboard.
type Service struct {
	pool *pgxpool.Pool

	mu     sync.Mutex
	buffer []Share
}

// New creates a new leaderboard Service backed by the given connection pool.
func New(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool}
}

// ActiveRoundID delegates to the db package helper.
func (s *Service) ActiveRoundID(ctx context.Context) (int64, error) {
	return db.ActiveRoundID(ctx, s.pool)
}

// BufferShare appends a share to an in-memory buffer instead of writing it to
// the database immediately. A real ASIC can submit shares multiple times a
// second; doing 2 DB round trips per share kept Neon compute active nearly
// continuously (it never got the 5 minutes of true idle it needs to
// auto-suspend), which is what made this pool's Neon usage scale with live
// share volume while the sibling pools' (tick-based, batched) usage didn't.
// Call FlushShares periodically to actually persist the buffer.
func (s *Service) BufferShare(sh Share) error {
	if sh.Difficulty == nil {
		return fmt.Errorf("leaderboard.BufferShare: Difficulty must not be nil")
	}
	s.mu.Lock()
	s.buffer = append(s.buffer, sh)
	s.mu.Unlock()
	return nil
}

// PendingShareCount returns how many shares are buffered awaiting the next
// FlushShares call. Exposed for tests and shutdown draining.
func (s *Service) PendingShareCount() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return len(s.buffer)
}

// FlushShares writes every buffered share to the database in one batched
// INSERT plus one batched worker-upsert, then clears the buffer. A no-op —
// zero DB round trips — if nothing has been buffered since the last call,
// which is what lets Neon compute actually suspend during genuinely idle
// windows (nobody mining), not just do less work per share while active.
func (s *Service) FlushShares(ctx context.Context) error {
	s.mu.Lock()
	pending := s.buffer
	s.buffer = nil
	s.mu.Unlock()

	if len(pending) == 0 {
		return nil
	}

	roundIDs := make([]int64, len(pending))
	addrs := make([]string, len(pending))
	workers := make([]string, len(pending))
	diffs := make([]string, len(pending))
	trueDiffs := make([]float64, len(pending))
	ports := make([]int32, len(pending))

	type workerKey struct{ addr, worker string }
	seenWorkers := make(map[workerKey]struct{}, len(pending))

	for i, sh := range pending {
		roundIDs[i] = sh.RoundID
		addrs[i] = sh.BTCAddress
		workers[i] = sh.WorkerName
		diffs[i] = sh.Difficulty.String()
		trueDiffs[i] = sh.TrueDiff
		ports[i] = int32(sh.SourcePort)
		seenWorkers[workerKey{sh.BTCAddress, sh.WorkerName}] = struct{}{}
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("FlushShares begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// share_difficulty is NUMERIC(78,0); pass as text and cast, same reason
	// the original single-row INSERT did — avoids driver type-mapping
	// ambiguity with *big.Int.
	if _, err := tx.Exec(ctx,
		`INSERT INTO shares (round_id, btc_address, worker_name, share_difficulty, true_difficulty, source_port)
		 SELECT * FROM UNNEST($1::BIGINT[], $2::TEXT[], $3::TEXT[], $4::NUMERIC[], $5::DOUBLE PRECISION[], $6::INT[])`,
		roundIDs, addrs, workers, diffs, trueDiffs, ports,
	); err != nil {
		return fmt.Errorf("FlushShares batch insert shares: %w", err)
	}

	wAddrs := make([]string, 0, len(seenWorkers))
	wWorkers := make([]string, 0, len(seenWorkers))
	for k := range seenWorkers {
		wAddrs = append(wAddrs, k.addr)
		wWorkers = append(wWorkers, k.worker)
	}
	if _, err := tx.Exec(ctx,
		`INSERT INTO workers (btc_address, worker_name, last_seen)
		 SELECT addr, worker, NOW() FROM UNNEST($1::TEXT[], $2::TEXT[]) AS t(addr, worker)
		 ON CONFLICT (btc_address, worker_name) DO UPDATE SET last_seen = EXCLUDED.last_seen`,
		wAddrs, wWorkers,
	); err != nil {
		return fmt.Errorf("FlushShares batch upsert workers: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("FlushShares commit: %w", err)
	}
	return nil
}

// GetTop21 returns up to 21 entries ranked by MAX(share_difficulty) for the
// given round, limited to shares submitted in the last 7 days, excluding stale.
// share_difficulty is stored as NUMERIC(78,0) and scanned as string then parsed
// with big.Int.
func (s *Service) GetTop21(ctx context.Context, roundID int64) ([]Entry, error) {
	const query = `
WITH recent AS (
  SELECT btc_address,
    MAX(true_difficulty) AS recent_best,
    MAX(submitted_at)    AS last_activity
  FROM shares
  WHERE round_id = $1
    AND submitted_at > NOW() - INTERVAL '7 days'
    AND is_stale = false
  GROUP BY btc_address
),
gaps AS (
  SELECT btc_address, submitted_at,
    submitted_at - LAG(submitted_at) OVER (PARTITION BY btc_address ORDER BY submitted_at) AS gap_before
  FROM shares
  WHERE round_id = $1
    AND is_stale = false
),
session_starts AS (
  SELECT btc_address, MAX(submitted_at) AS session_start
  FROM gaps
  WHERE gap_before > INTERVAL '7 days'
  GROUP BY btc_address
),
alltime AS (
  SELECT s.btc_address,
    MAX(s.true_difficulty)                       AS alltime_best,
    FLOOR(MAX(s.true_difficulty))::BIGINT::TEXT  AS best_share
  FROM shares s
  LEFT JOIN session_starts ss ON s.btc_address = ss.btc_address
  WHERE s.round_id = $1
    AND s.is_stale = false
    AND s.submitted_at >= COALESCE(ss.session_start, '-infinity'::TIMESTAMPTZ)
  GROUP BY s.btc_address
)
SELECT r.btc_address,
  a.best_share,
  r.last_activity,
  RANK() OVER (ORDER BY a.alltime_best DESC)::INT AS rank
FROM recent r
JOIN alltime a USING (btc_address)
ORDER BY a.alltime_best DESC
LIMIT 21`

	rows, err := s.pool.Query(ctx, query, roundID)
	if err != nil {
		return nil, fmt.Errorf("GetTop21 query: %w", err)
	}
	defer rows.Close()

	var entries []Entry
	for rows.Next() {
		var (
			addr         string
			bestShareStr string
			lastActivity time.Time
			rank         int
		)
		if err := rows.Scan(&addr, &bestShareStr, &lastActivity, &rank); err != nil {
			return nil, fmt.Errorf("GetTop21 scan: %w", err)
		}
		diff, ok := new(big.Int).SetString(bestShareStr, 10)
		if !ok {
			return nil, fmt.Errorf("GetTop21: cannot parse difficulty %q as big.Int", bestShareStr)
		}
		entries = append(entries, Entry{
			BTCAddress:          addr,
			BestShareDifficulty: diff,
			LastActivity:        lastActivity,
			Rank:                rank,
		})
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("GetTop21 rows: %w", err)
	}
	return entries, nil
}

// snapshotEntry is the JSON structure stored in blocks.top_21_snapshot.
type snapshotEntry struct {
	Rank       int    `json:"rank"`
	Address    string `json:"address"`
	AmountSats int64  `json:"amount_sats"`
}

// UnconfirmedBlock holds minimal fields for polling confirmation status.
type UnconfirmedBlock struct {
	ID      int64
	Hash    string
	Height  int32
	RoundID int64
}

// buildSnapshot computes payout amounts and marshals the top-21 snapshot JSON.
func buildSnapshot(snapshot []Entry, feesSats int64) ([]byte, error) {
	total := int64(312_500_000) + feesSats
	finderAmount := int64(float64(total) * coinbase.FinderPercent)
	poolFeeBase := int64(float64(total) * coinbase.PoolFeePercent)
	remaining := total - finderAmount - poolFeeBase
	perSlot := remaining / int64(coinbase.MaxRankedSlots)

	data := make([]snapshotEntry, len(snapshot))
	for i, e := range snapshot {
		data[i] = snapshotEntry{Rank: e.Rank, Address: e.BTCAddress, AmountSats: perSlot}
	}
	return json.Marshal(data)
}

// RecordUnconfirmedBlock inserts a block row with confirmed=false.
// It does NOT close the current round — call ConfirmBlock once the block
// reaches ≥2 confirmations on the main chain.
func (s *Service) RecordUnconfirmedBlock(ctx context.Context, bf BlockFound) (int64, error) {
	snapshot, err := s.GetTop21(ctx, bf.RoundID)
	if err != nil {
		return 0, fmt.Errorf("RecordUnconfirmedBlock snapshot: %w", err)
	}

	snapshotJSON, err := buildSnapshot(snapshot, bf.FeesSats)
	if err != nil {
		return 0, fmt.Errorf("RecordUnconfirmedBlock marshal: %w", err)
	}

	var blockID int64
	err = s.pool.QueryRow(ctx,
		`INSERT INTO blocks
		   (round_id, height, hash, finder_address, coinbase_txid, top_21_snapshot, block_fees_sats, confirmed)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, false)
		 RETURNING id`,
		bf.RoundID, bf.Height, bf.Hash, bf.FinderAddress, bf.CoinbaseTxID, snapshotJSON, bf.FeesSats,
	).Scan(&blockID)
	if err != nil {
		return 0, fmt.Errorf("RecordUnconfirmedBlock insert: %w", err)
	}
	return blockID, nil
}

// ConfirmBlock marks a block confirmed and finalizes its round.
// Closes the round associated with the block and opens a new one.
// Returns the new round ID. If the round was already closed (e.g. double-confirm),
// it sets confirmed=true and returns without opening another round.
func (s *Service) ConfirmBlock(ctx context.Context, blockID int64) (int64, error) {
	var roundID int64
	if err := s.pool.QueryRow(ctx, `SELECT round_id FROM blocks WHERE id=$1`, blockID).Scan(&roundID); err != nil {
		return 0, fmt.Errorf("ConfirmBlock get round_id: %w", err)
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return 0, fmt.Errorf("ConfirmBlock begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var alreadyClosed bool
	_ = tx.QueryRow(ctx, `SELECT ended_at IS NOT NULL FROM rounds WHERE id=$1`, roundID).Scan(&alreadyClosed)
	if alreadyClosed {
		if _, err = tx.Exec(ctx, `UPDATE blocks SET confirmed=true WHERE id=$1`, blockID); err != nil {
			return 0, fmt.Errorf("ConfirmBlock mark confirmed (round already closed): %w", err)
		}
		if err := tx.Commit(ctx); err != nil {
			return 0, fmt.Errorf("ConfirmBlock commit (round already closed): %w", err)
		}
		return roundID, nil
	}

	if _, err = tx.Exec(ctx, `UPDATE blocks SET confirmed=true WHERE id=$1`, blockID); err != nil {
		return 0, fmt.Errorf("ConfirmBlock mark confirmed: %w", err)
	}
	if _, err = tx.Exec(ctx, `UPDATE rounds SET ended_at=NOW(), block_id=$1 WHERE id=$2`, blockID, roundID); err != nil {
		return 0, fmt.Errorf("ConfirmBlock close round: %w", err)
	}

	var newRoundID int64
	if err = tx.QueryRow(ctx, `INSERT INTO rounds (started_at) VALUES (NOW()) RETURNING id`).Scan(&newRoundID); err != nil {
		return 0, fmt.Errorf("ConfirmBlock open new round: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return 0, fmt.Errorf("ConfirmBlock commit: %w", err)
	}
	return newRoundID, nil
}

// GetUnconfirmedBlocks returns blocks with confirmed=false and is_orphaned=false, oldest first.
func (s *Service) GetUnconfirmedBlocks(ctx context.Context) ([]UnconfirmedBlock, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, hash, height, round_id FROM blocks WHERE confirmed=false AND is_orphaned=false ORDER BY found_at ASC`)
	if err != nil {
		return nil, fmt.Errorf("GetUnconfirmedBlocks: %w", err)
	}
	defer rows.Close()

	var blocks []UnconfirmedBlock
	for rows.Next() {
		var b UnconfirmedBlock
		if err := rows.Scan(&b.ID, &b.Hash, &b.Height, &b.RoundID); err != nil {
			return nil, fmt.Errorf("GetUnconfirmedBlocks scan: %w", err)
		}
		blocks = append(blocks, b)
	}
	return blocks, rows.Err()
}

// MarkOrphaned flags a block as orphaned so the confirmation loop stops polling it.
func (s *Service) MarkOrphaned(ctx context.Context, blockID int64) error {
	_, err := s.pool.Exec(ctx, `UPDATE blocks SET is_orphaned=true WHERE id=$1`, blockID)
	if err != nil {
		return fmt.Errorf("MarkOrphaned: %w", err)
	}
	return nil
}
