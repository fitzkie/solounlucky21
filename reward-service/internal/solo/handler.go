package solo

import (
	"context"
	"fmt"
	"log/slog"
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
	pool      *pgxpool.Pool
	rpcClient *bitcoinrpc.Client
}

// New creates a solo Handler backed by the given DB pool and Bitcoin RPC client.
func New(pool *pgxpool.Pool, rpc *bitcoinrpc.Client) *Handler {
	return &Handler{pool: pool, rpcClient: rpc}
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

// RecordShare updates the worker's last-seen timestamp. Solo mining has no
// leaderboard, but we track activity so the frontend can show connected miners.
func (h *Handler) RecordShare(btcAddress, workerName, difficulty string, trueDiff float64, sourcePort int) error {
	ctx := context.Background()
	_, err := h.pool.Exec(ctx,
		`INSERT INTO workers (btc_address, worker_name, last_seen)
		 VALUES ($1, $2, NOW())
		 ON CONFLICT (btc_address, worker_name)
		 DO UPDATE SET last_seen = EXCLUDED.last_seen`,
		btcAddress, workerName,
	)
	if err != nil {
		return fmt.Errorf("solo RecordShare: %w", err)
	}
	return nil
}

// BlockFound records a solo block find in solo_blocks.
// Payout is computed here (99% to finder) and stored for frontend display.
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
	return nil
}

// StartConfirmationLoop polls every 60 s for unconfirmed solo blocks and marks
// them confirmed (≥2 confirmations) or orphaned (confs < 0).
func (h *Handler) StartConfirmationLoop(ctx context.Context) {
	go func() {
		ticker := time.NewTicker(60 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				h.checkConfirmations(ctx)
			}
		}
	}()
}

type pendingBlock struct {
	id     int64
	hash   string
	height int32
}

func (h *Handler) checkConfirmations(ctx context.Context) {
	rows, err := h.pool.Query(ctx,
		`SELECT id, hash, height FROM solo_blocks
		 WHERE confirmed = false AND is_orphaned = false`)
	if err != nil {
		slog.Error("solo: query unconfirmed blocks", "err", err)
		return
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

	for _, b := range blocks {
		confs, err := h.rpcClient.GetBlockConfirmations(b.hash)
		if err != nil {
			slog.Warn("solo: getblockheader failed", "hash", b.hash, "err", err)
			continue
		}
		switch {
		case confs < 0:
			if _, err := h.pool.Exec(ctx,
				`UPDATE solo_blocks SET is_orphaned = true WHERE id = $1`, b.id); err != nil {
				slog.Error("solo: mark orphaned", "err", err)
			} else {
				slog.Warn("solo block orphaned", "height", b.height, "hash", b.hash)
			}
		case confs >= 2:
			if _, err := h.pool.Exec(ctx,
				`UPDATE solo_blocks SET confirmed = true WHERE id = $1`, b.id); err != nil {
				slog.Error("solo: mark confirmed", "err", err)
			} else {
				slog.Info("solo block confirmed", "height", b.height, "hash", b.hash, "confs", confs)
			}
		default:
			slog.Info("solo block pending", "height", b.height, "confs", confs)
		}
	}
}
