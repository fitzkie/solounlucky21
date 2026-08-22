package solo

import (
	"context"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"unlucky21/reward/internal/bitcoinrpc"
	"unlucky21/reward/internal/coinbase"
	"unlucky21/reward/internal/socket"
)

const (
	// SoloSocketPath is the Unix socket the solo datum_gateway instance connects to.
	SoloSocketPath = "/var/run/unlucky21/solo.sock"

	// SoloFeePercent is the pool's cut from a solo block find (1%).
	SoloFeePercent = 0.01

	// subsidySats is the current block subsidy. Update after the ~2028 halving.
	subsidySats = int64(312_500_000)
)

// Handler implements socket.Handler for the solo mining pool.
// Coinbase: 99% to finder, 1% to pool fee address.
// No leaderboard, no rounds — each block find stands alone.
type Handler struct {
	pool         *pgxpool.Pool
	rpcClient    *bitcoinrpc.Client
	blockPending chan struct{} // non-blocking signal: a solo block needs confirmation

	mu      sync.Mutex
	pending []workerActivity // buffered last-seen updates, see RecordShare/FlushWorkers
}

// workerActivity is one buffered "this worker is active" event.
type workerActivity struct {
	btcAddress string
	workerName string
}

// New creates a solo Handler backed by the given DB pool and Bitcoin RPC client.
func New(pool *pgxpool.Pool, rpc *bitcoinrpc.Client) *Handler {
	return &Handler{
		pool:         pool,
		rpcClient:    rpc,
		blockPending: make(chan struct{}, 1),
	}
}

// GetCoinbaseOutputs returns two outputs: finder (99%) then pool fee (1%).
func (h *Handler) GetCoinbaseOutputs(minerAddress string, feesSats int64) ([]socket.Output, error) {
	total := subsidySats + feesSats
	poolFee := int64(float64(total) * SoloFeePercent)
	finderAmount := total - poolFee
	return []socket.Output{
		{Address: minerAddress, AmountSats: finderAmount},
		{Address: coinbase.PoolFeeAddress, AmountSats: poolFee},
	}, nil
}

// RecordShare buffers a "this worker is active" event in memory instead of
// writing it to the database immediately — same reasoning as the shared
// pool's leaderboard.Service.BufferShare: a per-share DB round trip keeps
// Neon compute awake continuously while any miner is connected. Call
// FlushWorkers periodically to actually persist the buffer.
func (h *Handler) RecordShare(btcAddress, workerName, difficulty string, trueDiff float64, sourcePort int) error {
	h.mu.Lock()
	h.pending = append(h.pending, workerActivity{btcAddress: btcAddress, workerName: workerName})
	h.mu.Unlock()
	return nil
}

// PendingWorkerCount returns how many worker-activity events are buffered
// awaiting the next FlushWorkers call. Exposed for tests and shutdown draining.
func (h *Handler) PendingWorkerCount() int {
	h.mu.Lock()
	defer h.mu.Unlock()
	return len(h.pending)
}

// FlushWorkers writes every buffered worker-activity event to the database
// as one batched upsert, then clears the buffer. A no-op — zero DB round
// trips — if nothing has been buffered since the last call.
func (h *Handler) FlushWorkers(ctx context.Context) error {
	h.mu.Lock()
	pending := h.pending
	h.pending = nil
	h.mu.Unlock()

	if len(pending) == 0 {
		return nil
	}

	type workerKey struct{ addr, worker string }
	seen := make(map[workerKey]struct{}, len(pending))
	for _, wa := range pending {
		seen[workerKey{wa.btcAddress, wa.workerName}] = struct{}{}
	}

	addrs := make([]string, 0, len(seen))
	workers := make([]string, 0, len(seen))
	for k := range seen {
		addrs = append(addrs, k.addr)
		workers = append(workers, k.worker)
	}

	_, err := h.pool.Exec(ctx,
		`INSERT INTO workers (btc_address, worker_name, last_seen)
		 SELECT addr, worker, NOW() FROM UNNEST($1::TEXT[], $2::TEXT[]) AS t(addr, worker)
		 ON CONFLICT (btc_address, worker_name) DO UPDATE SET last_seen = EXCLUDED.last_seen`,
		addrs, workers,
	)
	if err != nil {
		return fmt.Errorf("solo FlushWorkers: %w", err)
	}
	return nil
}

// BlockFound records a solo block find in solo_blocks and wakes the
// confirmation loop. Payout is computed here (99% to finder) and stored for
// frontend display.
func (h *Handler) BlockFound(height int32, hash, finderAddress, coinbaseTxID string, feesSats int64) error {
	ctx := context.Background()
	total := subsidySats + feesSats
	poolFee := int64(float64(total) * SoloFeePercent)
	payoutSats := total - poolFee

	_, err := h.pool.Exec(ctx,
		`INSERT INTO solo_blocks
		   (height, hash, finder_address, coinbase_txid, fees_sats, payout_sats)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 ON CONFLICT (hash) DO NOTHING`,
		height, hash, finderAddress, coinbaseTxID, feesSats, payoutSats,
	)
	if err != nil {
		return fmt.Errorf("solo BlockFound insert: %w", err)
	}
	slog.Info("solo block submitted — awaiting confirmation",
		"height", height,
		"hash", hash,
		"finder", finderAddress,
		"payout_sats", payoutSats,
	)

	// Wake the confirmation loop. Non-blocking: if already active, the loop
	// will pick up the new block in its next DB query.
	select {
	case h.blockPending <- struct{}{}:
	default:
	}
	return nil
}

// StartConfirmationLoop sleeps until a solo block is found, then polls every
// 60 s until the block is confirmed (≥2 confirmations) or orphaned, then goes
// idle again. On restart it re-seeds itself if unconfirmed blocks exist in DB.
func (h *Handler) StartConfirmationLoop(ctx context.Context) {
	go func() {
		// Recover any blocks that were pending before the last shutdown.
		var count int
		if err := h.pool.QueryRow(ctx,
			`SELECT COUNT(*) FROM solo_blocks WHERE confirmed=false AND is_orphaned=false`,
		).Scan(&count); err == nil && count > 0 {
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

			// Active: poll every 60 s until the unconfirmed queue is empty.
			ticker := time.NewTicker(60 * time.Second)
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

type pendingBlock struct {
	id     int64
	hash   string
	height int32
}

// checkConfirmations queries for unconfirmed solo blocks, checks Bitcoin RPC
// for confirmation counts, and updates the DB. Returns the number of blocks
// still waiting for ≥2 confirmations so the caller knows whether to keep polling.
func (h *Handler) checkConfirmations(ctx context.Context) int {
	rows, err := h.pool.Query(ctx,
		`SELECT id, hash, height FROM solo_blocks
		 WHERE confirmed = false AND is_orphaned = false`)
	if err != nil {
		slog.Error("solo: query unconfirmed blocks", "err", err)
		return 1 // assume still pending; keep polling
	}

	var blocks []pendingBlock
	for rows.Next() {
		var b pendingBlock
		if err := rows.Scan(&b.id, &b.hash, &b.height); err != nil {
			slog.Error("solo: scan block", "err", err)
		} else {
			blocks = append(blocks, b)
		}
	}
	rows.Close()

	pending := 0
	for _, b := range blocks {
		confs, err := h.rpcClient.GetBlockConfirmations(b.hash)
		if err != nil {
			slog.Warn("solo: getblockheader failed", "hash", b.hash, "err", err)
			pending++
			continue
		}
		switch {
		case confs < 0:
			if _, err := h.pool.Exec(ctx,
				`UPDATE solo_blocks SET is_orphaned = true WHERE id = $1`, b.id); err != nil {
				slog.Error("solo: mark orphaned", "err", err)
				pending++
			} else {
				slog.Warn("solo block orphaned", "height", b.height, "hash", b.hash)
			}
		case confs >= 2:
			if _, err := h.pool.Exec(ctx,
				`UPDATE solo_blocks SET confirmed = true WHERE id = $1`, b.id); err != nil {
				slog.Error("solo: mark confirmed", "err", err)
				pending++
			} else {
				slog.Info("solo block confirmed", "height", b.height, "hash", b.hash, "confs", confs)
			}
		default:
			slog.Info("solo block pending", "height", b.height, "confs", confs)
			pending++
		}
	}
	return pending
}
