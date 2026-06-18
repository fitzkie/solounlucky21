package leaderboard

import (
	"context"
	"encoding/json"
	"fmt"
	"math/big"
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
}

// New creates a new leaderboard Service backed by the given connection pool.
func New(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool}
}

// ActiveRoundID delegates to the db package helper.
func (s *Service) ActiveRoundID(ctx context.Context) (int64, error) {
	return db.ActiveRoundID(ctx, s.pool)
}

// RecordShare inserts a share row and upserts the worker last-seen record.
func (s *Service) RecordShare(ctx context.Context, sh Share) error {
	if sh.Difficulty == nil {
		return fmt.Errorf("leaderboard.RecordShare: Difficulty must not be nil")
	}

	// Insert the share. share_difficulty is NUMERIC(78,0); pass as string to
	// avoid any driver type-mapping ambiguity with *big.Int.
	_, err := s.pool.Exec(ctx,
		`INSERT INTO shares (round_id, btc_address, worker_name, share_difficulty, true_difficulty, source_port)
		 VALUES ($1, $2, $3, $4::NUMERIC, $5, $6)`,
		sh.RoundID,
		sh.BTCAddress,
		sh.WorkerName,
		sh.Difficulty.String(),
		sh.TrueDiff,
		sh.SourcePort,
	)
	if err != nil {
		return fmt.Errorf("insert share: %w", err)
	}

	// Upsert worker last-seen timestamp.
	_, err = s.pool.Exec(ctx,
		`INSERT INTO workers (btc_address, worker_name, last_seen)
		 VALUES ($1, $2, NOW())
		 ON CONFLICT (btc_address, worker_name)
		 DO UPDATE SET last_seen = EXCLUDED.last_seen`,
		sh.BTCAddress,
		sh.WorkerName,
	)
	if err != nil {
		return fmt.Errorf("upsert worker: %w", err)
	}
	return nil
}

// GetTop21 returns up to 21 entries ranked by MAX(share_difficulty) for the
// given round, limited to shares submitted in the last 7 days, excluding stale.
// share_difficulty is stored as NUMERIC(78,0) and scanned as string then parsed
// with big.Int.
func (s *Service) GetTop21(ctx context.Context, roundID int64) ([]Entry, error) {
	const query = `
SELECT
  btc_address,
  FLOOR(MAX(true_difficulty))::BIGINT::TEXT AS best_share,
  MAX(submitted_at)           AS last_activity,
  RANK() OVER (ORDER BY MAX(true_difficulty) DESC)::INT AS rank
FROM shares
WHERE round_id = $1
  AND submitted_at > NOW() - INTERVAL '7 days'
GROUP BY btc_address
ORDER BY MAX(true_difficulty) DESC
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

// ResetForBlock atomically:
//  1. Snapshots the current top 21
//  2. Inserts a block record with the snapshot
//  3. Closes the current round (sets ended_at, block_id)
//  4. Opens a new round
//
// Returns the snapshot entries and the new round ID.
func (s *Service) ResetForBlock(ctx context.Context, bf BlockFound) ([]Entry, int64, error) {
	// Read snapshot using the pool (outside tx) for a consistent view before
	// we mutate anything.
	snapshot, err := s.GetTop21(ctx, bf.RoundID)
	if err != nil {
		return nil, 0, fmt.Errorf("ResetForBlock snapshot: %w", err)
	}

	// Compute per-slot amount using same formula as coinbase.BuildOutputs.
	total := int64(312_500_000) + bf.FeesSats
	finderAmount := int64(float64(total) * coinbase.FinderPercent)
	poolFeeBase := int64(float64(total) * coinbase.PoolFeePercent)
	remaining := total - finderAmount - poolFeeBase
	perSlot := remaining / int64(coinbase.MaxRankedSlots)

	// Build snapshot JSON array.
	snapshotData := make([]snapshotEntry, len(snapshot))
	for i, e := range snapshot {
		snapshotData[i] = snapshotEntry{
			Rank:       e.Rank,
			Address:    e.BTCAddress,
			AmountSats: perSlot,
		}
	}
	snapshotJSON, err := json.Marshal(snapshotData)
	if err != nil {
		return nil, 0, fmt.Errorf("ResetForBlock marshal snapshot: %w", err)
	}

	// Begin transaction.
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, 0, fmt.Errorf("ResetForBlock begin tx: %w", err)
	}
	defer func() {
		// Rollback is a no-op if the tx was already committed.
		_ = tx.Rollback(ctx)
	}()

	// 1. Insert block record, get back id.
	var blockID int64
	err = tx.QueryRow(ctx,
		`INSERT INTO blocks
		   (round_id, height, hash, finder_address, coinbase_txid, top_21_snapshot, block_fees_sats)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)
		 RETURNING id`,
		bf.RoundID,
		bf.Height,
		bf.Hash,
		bf.FinderAddress,
		bf.CoinbaseTxID,
		snapshotJSON,
		bf.FeesSats,
	).Scan(&blockID)
	if err != nil {
		return nil, 0, fmt.Errorf("ResetForBlock insert block: %w", err)
	}

	// 2. Close the current round.
	_, err = tx.Exec(ctx,
		`UPDATE rounds SET ended_at = NOW(), block_id = $1 WHERE id = $2`,
		blockID, bf.RoundID,
	)
	if err != nil {
		return nil, 0, fmt.Errorf("ResetForBlock close round: %w", err)
	}

	// 3. Open a new round.
	var newRoundID int64
	err = tx.QueryRow(ctx,
		`INSERT INTO rounds (started_at) VALUES (NOW()) RETURNING id`,
	).Scan(&newRoundID)
	if err != nil {
		return nil, 0, fmt.Errorf("ResetForBlock open new round: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, 0, fmt.Errorf("ResetForBlock commit: %w", err)
	}

	return snapshot, newRoundID, nil
}
