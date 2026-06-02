package main

import (
	"context"
	"fmt"
	"log/slog"
	"math/big"
	"os"
	"sync"
	"time"

	"unlucky21/reward/internal/coinbase"
	"unlucky21/reward/internal/db"
	"unlucky21/reward/internal/leaderboard"
	"unlucky21/reward/internal/socket"
)

// poolHandler satisfies socket.Handler by delegating to the leaderboard service
// and coinbase builder.
type poolHandler struct {
	mu      sync.RWMutex
	svc     *leaderboard.Service
	roundID int64
	top21   []leaderboard.Entry // in-memory cache, refreshed every 10s
}

// GetCoinbaseOutputs returns the ordered coinbase output list for a miner.
// Uses a read lock so it can run concurrently with share recording; a write
// lock during BlockFound prevents templates being built against a
// partially-reset state.
func (h *poolHandler) GetCoinbaseOutputs(minerAddress string, feesSats int64) ([]socket.Output, error) {
	h.mu.RLock()
	top21 := h.top21
	h.mu.RUnlock()

	ranked := make([]coinbase.RankedAddress, len(top21))
	for i, e := range top21 {
		ranked[i] = coinbase.RankedAddress{Address: e.BTCAddress}
	}

	// Update to 156_250_000 after next halving (~2028)
	const subsidySats int64 = 312_500_000

	cbOutputs := coinbase.BuildOutputs(minerAddress, subsidySats, feesSats, ranked)

	outputs := make([]socket.Output, len(cbOutputs))
	for i, o := range cbOutputs {
		outputs[i] = socket.Output{
			Address:    o.Address,
			AmountSats: o.AmountSats,
		}
	}
	return outputs, nil
}

// RecordShare records a single share submission.
func (h *poolHandler) RecordShare(btcAddress, workerName, difficulty string, isStale bool) error {
	h.mu.RLock()
	roundID := h.roundID
	h.mu.RUnlock()

	diff, ok := new(big.Int).SetString(difficulty, 10)
	if !ok {
		return fmt.Errorf("invalid difficulty: %q", difficulty)
	}

	ctx := context.Background()
	return h.svc.RecordShare(ctx, leaderboard.Share{
		RoundID:    roundID,
		BTCAddress: btcAddress,
		WorkerName: workerName,
		Difficulty: diff,
		IsStale:    isStale,
	})
}

// BlockFound handles a block-found event atomically. Acquires a write lock so
// GetCoinbaseOutputs cannot race with the round reset.
func (h *poolHandler) BlockFound(height int32, hash, finderAddress, coinbaseTxID string, feesSats int64) error {
	ctx := context.Background()

	h.mu.Lock()
	defer h.mu.Unlock()

	_, newRoundID, err := h.svc.ResetForBlock(ctx, leaderboard.BlockFound{
		RoundID:       h.roundID,
		Height:        height,
		Hash:          hash,
		FinderAddress: finderAddress,
		CoinbaseTxID:  coinbaseTxID,
		FeesSats:      feesSats,
	})
	if err != nil {
		return fmt.Errorf("BlockFound reset: %w", err)
	}

	h.roundID = newRoundID
	h.top21 = nil // will refresh on next tick

	slog.Info("block found",
		"height", height,
		"hash", hash,
		"finder", finderAddress,
		"coinbase_txid", coinbaseTxID,
		"fees_sats", feesSats,
		"new_round_id", newRoundID,
	)
	return nil
}

// startRefreshLoop launches a background goroutine that refreshes the
// in-memory leaderboard cache every 10 seconds until ctx is cancelled.
func (h *poolHandler) startRefreshLoop(ctx context.Context) {
	go func() {
		ticker := time.NewTicker(10 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				h.refreshLeaderboard(ctx)
			}
		}
	}()
}

// refreshLeaderboard fetches the current top-21 from the database and updates
// the in-memory cache.
func (h *poolHandler) refreshLeaderboard(ctx context.Context) {
	h.mu.RLock()
	roundID := h.roundID
	h.mu.RUnlock()

	entries, err := h.svc.GetTop21(ctx, roundID)
	if err != nil {
		slog.Error("leaderboard refresh failed", "err", err)
		return
	}

	h.mu.Lock()
	h.top21 = entries
	h.mu.Unlock()
}

func main() {
	ctx := context.Background()

	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		slog.Error("DATABASE_URL environment variable is required")
		os.Exit(1)
	}

	pool, err := db.Connect(ctx, dsn)
	if err != nil {
		slog.Error("database connect failed", "err", err)
		os.Exit(1)
	}
	defer pool.Close()

	roundID, err := db.ActiveRoundID(ctx, pool)
	if err != nil {
		slog.Error("active round id failed", "err", err)
		os.Exit(1)
	}

	handler := &poolHandler{
		svc:     leaderboard.New(pool),
		roundID: roundID,
	}
	handler.startRefreshLoop(ctx)

	// Do initial leaderboard load before accepting connections.
	handler.refreshLeaderboard(ctx)

	srv := socket.NewServer(socket.SocketPath, handler)
	slog.Info("reward service starting", "socket", socket.SocketPath, "round_id", roundID)
	if err := srv.Listen(); err != nil {
		slog.Error("socket server error", "err", err)
		os.Exit(1)
	}
}
