package main

import (
	"context"
	"fmt"
	"log/slog"
	"math/big"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"unlucky21/reward/internal/bitcoinrpc"
	"unlucky21/reward/internal/coinbase"
	"unlucky21/reward/internal/db"
	"unlucky21/reward/internal/leaderboard"
	"unlucky21/reward/internal/socket"
	"unlucky21/reward/internal/solo"
)

// poolHandler satisfies socket.Handler by delegating to the leaderboard service
// and coinbase builder.
type poolHandler struct {
	mu           sync.RWMutex
	svc          *leaderboard.Service
	rpcClient    *bitcoinrpc.Client
	roundID      int64
	top21        []leaderboard.Entry // in-memory cache, refreshed every 6 minutes
	blockPending chan struct{}        // non-blocking signal: a block needs confirmation
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

// RecordShare buffers a single share submission in memory (see
// leaderboard.Service.BufferShare) instead of writing it to the database
// immediately. startShareFlushLoop persists the buffer periodically.
func (h *poolHandler) RecordShare(btcAddress, workerName, difficulty string, trueDiff float64, sourcePort int) error {
	h.mu.RLock()
	roundID := h.roundID
	h.mu.RUnlock()

	diff, ok := new(big.Int).SetString(difficulty, 10)
	if !ok {
		return fmt.Errorf("invalid difficulty: %q", difficulty)
	}

	return h.svc.BufferShare(leaderboard.Share{
		RoundID:    roundID,
		BTCAddress: btcAddress,
		WorkerName: workerName,
		Difficulty: diff,
		TrueDiff:   trueDiff,
		SourcePort: sourcePort,
	})
}

// BlockFound records the block as unconfirmed and wakes the confirmation loop.
// The round is NOT closed here — startConfirmationLoop finalizes it once the
// block reaches ≥2 confirmations.
func (h *poolHandler) BlockFound(height int32, hash, finderAddress, coinbaseTxID string, feesSats int64) error {
	ctx := context.Background()

	h.mu.RLock()
	roundID := h.roundID
	h.mu.RUnlock()

	blockID, err := h.svc.RecordUnconfirmedBlock(ctx, leaderboard.BlockFound{
		RoundID:       roundID,
		Height:        height,
		Hash:          hash,
		FinderAddress: finderAddress,
		CoinbaseTxID:  coinbaseTxID,
		FeesSats:      feesSats,
	})
	if err != nil {
		return fmt.Errorf("BlockFound record: %w", err)
	}

	slog.Info("block submitted — awaiting confirmation",
		"height", height,
		"hash", hash,
		"finder", finderAddress,
		"coinbase_txid", coinbaseTxID,
		"fees_sats", feesSats,
		"block_id", blockID,
	)

	// Wake the confirmation loop. Non-blocking: if the loop is already active
	// (a prior block is still pending), the signal is dropped safely — the loop
	// will pick up the new block in its next GetUnconfirmedBlocks call.
	select {
	case h.blockPending <- struct{}{}:
	default:
	}
	return nil
}

// startConfirmationLoop sleeps until a block is found, then polls every 30 s
// until all pending blocks are confirmed or orphaned, then goes idle again.
// On restart it re-seeds itself if unconfirmed blocks already exist in the DB.
func (h *poolHandler) startConfirmationLoop(ctx context.Context) {
	go func() {
		// Recover any blocks that were pending before the last shutdown.
		if blocks, err := h.svc.GetUnconfirmedBlocks(ctx); err == nil && len(blocks) > 0 {
			select {
			case h.blockPending <- struct{}{}:
			default:
			}
		}

		for {
			// Idle: wait for BlockFound to signal a new block.
			select {
			case <-ctx.Done():
				return
			case <-h.blockPending:
			}

			// Active: poll every 30 s until the unconfirmed queue is empty.
			ticker := time.NewTicker(30 * time.Second)
			for {
				if remaining := h.checkConfirmations(ctx); remaining == 0 {
					break
				}
				select {
				case <-ctx.Done():
					ticker.Stop()
					return
				case <-ticker.C:
				}
			}
			ticker.Stop()
		}
	}()
}

// checkConfirmations queries for unconfirmed blocks, checks Bitcoin RPC for
// confirmation counts, and updates the DB. Returns the number of blocks still
// waiting for ≥2 confirmations so the caller knows whether to keep polling.
func (h *poolHandler) checkConfirmations(ctx context.Context) int {
	blocks, err := h.svc.GetUnconfirmedBlocks(ctx)
	if err != nil {
		slog.Error("get unconfirmed blocks failed", "err", err)
		return 1 // assume still pending; keep polling
	}
	pending := 0
	for _, b := range blocks {
		confs, err := h.rpcClient.GetBlockConfirmations(b.Hash)
		if err != nil {
			slog.Warn("getblockheader failed (block not yet propagated?)",
				"hash", b.Hash, "height", b.Height, "err", err)
			pending++
			continue
		}
		if confs < 0 {
			if err := h.svc.MarkOrphaned(ctx, b.ID); err != nil {
				slog.Error("mark orphaned failed", "block_id", b.ID, "err", err)
				pending++
			} else {
				slog.Warn("block orphaned — marked, round continues",
					"height", b.Height, "hash", b.Hash)
			}
			continue
		}
		if confs < 2 {
			slog.Info("block pending", "height", b.Height, "confirmations", confs)
			pending++
			continue
		}

		newRoundID, err := h.svc.ConfirmBlock(ctx, b.ID)
		if err != nil {
			slog.Error("confirm block failed", "block_id", b.ID, "err", err)
			pending++
			continue
		}

		h.mu.Lock()
		h.roundID = newRoundID
		h.top21 = nil
		h.mu.Unlock()

		slog.Info("block confirmed — new round opened",
			"height", b.Height,
			"hash", b.Hash,
			"confirmations", confs,
			"new_round_id", newRoundID,
		)
	}
	return pending
}

// startRefreshLoop launches a background goroutine that refreshes the
// in-memory leaderboard cache every 6 minutes until ctx is cancelled.
// 6 minutes keeps Neon compute free to auto-suspend between cycles
// (Neon suspends after 5 minutes of idle).
func (h *poolHandler) startRefreshLoop(ctx context.Context) {
	go func() {
		ticker := time.NewTicker(6 * time.Minute)
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

// startShareFlushLoop periodically writes buffered shares to the database in
// one batch. 30s keeps the shares table close to real-time for the 6-minute
// leaderboard refresh to read from, while still collapsing what could be many
// individual submissions per second (real ASICs) into one round trip — and,
// critically, doing nothing at all when the buffer is empty, which is what
// lets Neon compute actually suspend when nobody's mining instead of running
// continuously whenever any single low-power miner is connected.
func (h *poolHandler) startShareFlushLoop(ctx context.Context) {
	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				if err := h.svc.FlushShares(ctx); err != nil {
					slog.Error("flush shares failed", "err", err)
				}
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

// startSoloFlushLoop periodically writes buffered solo-worker activity to the
// database in one batch. Same reasoning as startShareFlushLoop; solo mining
// has no leaderboard to keep fresh, so a longer interval is fine.
func startSoloFlushLoop(ctx context.Context, h *solo.Handler) {
	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				if err := h.FlushWorkers(ctx); err != nil {
					slog.Error("flush solo workers failed", "err", err)
				}
			}
		}
	}()
}

func main() {
	// SIGTERM/SIGINT cancel ctx, which every background loop below selects on.
	// This matters more than it used to: shares now sit in memory for up to
	// 30s before being flushed (see startShareFlushLoop), so a plain SIGKILL-
	// equivalent shutdown could silently drop a buffered share. A graceful
	// stop (systemd's default) gives the final flush below a chance to run.
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
	defer stop()

	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		slog.Error("DATABASE_URL environment variable is required")
		os.Exit(1)
	}

	rpcURL := os.Getenv("BITCOIN_RPC_URL")
	rpcUser := os.Getenv("BITCOIN_RPC_USER")
	rpcPass := os.Getenv("BITCOIN_RPC_PASS")
	if rpcURL == "" || rpcUser == "" || rpcPass == "" {
		slog.Error("BITCOIN_RPC_URL, BITCOIN_RPC_USER, BITCOIN_RPC_PASS are required")
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

	rpc := bitcoinrpc.New(rpcURL, rpcUser, rpcPass)

	handler := &poolHandler{
		svc:          leaderboard.New(pool),
		rpcClient:    rpc,
		roundID:      roundID,
		blockPending: make(chan struct{}, 1),
	}
	handler.startRefreshLoop(ctx)
	handler.startConfirmationLoop(ctx)
	handler.startShareFlushLoop(ctx)

	// Do initial leaderboard load before accepting connections.
	handler.refreshLeaderboard(ctx)

	// Start shared pool socket server in background.
	sharedSrv := socket.NewServer(socket.SocketPath, handler)
	slog.Info("shared pool socket starting", "socket", socket.SocketPath, "round_id", roundID)
	go func() {
		if err := sharedSrv.Listen(); err != nil {
			slog.Error("shared socket server error", "err", err)
			os.Exit(1)
		}
	}()

	// Start solo pool socket server in background.
	soloHandler := solo.New(pool, rpc)
	soloHandler.StartConfirmationLoop(ctx)
	startSoloFlushLoop(ctx, soloHandler)
	soloSrv := socket.NewServer(solo.SoloSocketPath, soloHandler)
	slog.Info("solo pool socket starting", "socket", solo.SoloSocketPath)
	go func() {
		if err := soloSrv.Listen(); err != nil {
			slog.Error("solo socket server error", "err", err)
			os.Exit(1)
		}
	}()

	// Block until context cancelled (both servers run in goroutines above).
	<-ctx.Done()
	slog.Info("shutdown signal received — flushing buffered shares before exit")

	// ctx is already cancelled, so give the final flush its own short-lived
	// context rather than one that's already done.
	flushCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := handler.svc.FlushShares(flushCtx); err != nil {
		slog.Error("final share flush on shutdown failed", "err", err)
	}
	if err := soloHandler.FlushWorkers(flushCtx); err != nil {
		slog.Error("final solo worker flush on shutdown failed", "err", err)
	}
}
