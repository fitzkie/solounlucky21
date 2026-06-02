package socket

import (
	"bufio"
	"encoding/json"
	"fmt"
	"log/slog"
	"net"
	"os"
	"time"
)

const SocketPath = "/var/run/unlucky21/reward.sock"

// Output is one coinbase output in the response to datum_gateway.
type Output struct {
	Address    string `json:"address"`
	AmountSats int64  `json:"amount_sats"`
}

// Handler is implemented by the main service to wire business logic.
type Handler interface {
	// GetCoinbaseOutputs returns the ordered coinbase output list for a miner.
	// Falls back to solo output if called during an error state.
	GetCoinbaseOutputs(minerAddress string, feesSats int64) ([]Output, error)

	// RecordShare records a share submission. Called asynchronously.
	RecordShare(btcAddress, workerName, difficulty string, isStale bool) error

	// BlockFound handles a block-found event atomically.
	BlockFound(height int32, hash, finderAddress, coinbaseTxID string, feesSats int64) error
}

// Server listens on a Unix domain socket and dispatches to Handler.
type Server struct {
	socketPath string
	handler    Handler
}

// NewServer creates a new Server with the given socket path and handler.
func NewServer(socketPath string, h Handler) *Server {
	return &Server{
		socketPath: socketPath,
		handler:    h,
	}
}

// Listen removes any existing socket file, binds, and accepts connections.
// Handles each connection in a goroutine. Blocks until error.
func (s *Server) Listen() error {
	// Remove stale socket file if it exists.
	if err := os.Remove(s.socketPath); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("socket: remove stale socket: %w", err)
	}

	ln, err := net.Listen("unix", s.socketPath)
	if err != nil {
		return fmt.Errorf("socket: listen: %w", err)
	}
	defer ln.Close()

	slog.Info("socket server listening", "path", s.socketPath)

	for {
		conn, err := ln.Accept()
		if err != nil {
			return fmt.Errorf("socket: accept: %w", err)
		}
		go s.handleConn(conn)
	}
}

// inboundMsg is the generic envelope for all messages from datum_gateway.
type inboundMsg struct {
	Type string `json:"type"`

	// coinbase fields
	MinerAddress string `json:"miner_address"`
	FeesSats     int64  `json:"fees_sats"`

	// share fields
	BTCAddress string `json:"btc_address"`
	WorkerName string `json:"worker_name"`
	Difficulty string `json:"difficulty"`
	IsStale    bool   `json:"is_stale"`

	// block_found fields
	Height        int32  `json:"height"`
	Hash          string `json:"hash"`
	FinderAddress string `json:"finder_address"`
	CoinbaseTxID  string `json:"coinbase_txid"`
}

// coinbaseResponse is returned to datum_gateway for a coinbase request.
type coinbaseResponse struct {
	Outputs []Output `json:"outputs"`
}

// ackResponse is returned to datum_gateway for a block_found event.
type ackResponse struct {
	Status string `json:"status"`
}

const readDeadline = 500 * time.Millisecond

func (s *Server) handleConn(conn net.Conn) {
	defer conn.Close()

	scanner := bufio.NewScanner(conn)
	for scanner.Scan() {
		// Refresh deadline on each message read.
		if err := conn.SetDeadline(time.Now().Add(readDeadline)); err != nil {
			slog.Error("socket: set deadline", "err", err)
			return
		}

		line := scanner.Bytes()
		var msg inboundMsg
		if err := json.Unmarshal(line, &msg); err != nil {
			slog.Error("socket: malformed message", "err", err, "raw", string(line))
			continue
		}

		switch msg.Type {
		case "coinbase":
			s.handleCoinbase(conn, &msg)
		case "share":
			s.handleShare(&msg)
		case "block_found":
			s.handleBlockFound(conn, &msg)
		default:
			slog.Warn("socket: unknown message type", "type", msg.Type)
		}
	}

	if err := scanner.Err(); err != nil {
		// Deadline/timeout errors are expected on idle connections; log at debug level.
		slog.Debug("socket: scanner error", "err", err)
	}
}

func (s *Server) handleCoinbase(conn net.Conn, msg *inboundMsg) {
	outputs, err := s.handler.GetCoinbaseOutputs(msg.MinerAddress, msg.FeesSats)
	if err != nil {
		slog.Error("socket: GetCoinbaseOutputs failed, falling back to solo output",
			"miner", msg.MinerAddress, "err", err)
		// Fallback: single output with amount_sats=-1 signals full reward to C layer.
		outputs = []Output{
			{Address: msg.MinerAddress, AmountSats: -1},
		}
	}

	resp, err := json.Marshal(coinbaseResponse{Outputs: outputs})
	if err != nil {
		slog.Error("socket: marshal coinbase response", "err", err)
		return
	}
	resp = append(resp, '\n')

	if _, err := conn.Write(resp); err != nil {
		slog.Error("socket: write coinbase response", "err", err)
	}
}

func (s *Server) handleShare(msg *inboundMsg) {
	// Fire-and-forget: run in goroutine, no response written.
	go func() {
		if err := s.handler.RecordShare(msg.BTCAddress, msg.WorkerName, msg.Difficulty, msg.IsStale); err != nil {
			slog.Error("socket: RecordShare failed", "address", msg.BTCAddress, "err", err)
		}
	}()
}

func (s *Server) handleBlockFound(conn net.Conn, msg *inboundMsg) {
	if err := s.handler.BlockFound(msg.Height, msg.Hash, msg.FinderAddress, msg.CoinbaseTxID, msg.FeesSats); err != nil {
		slog.Error("socket: BlockFound failed", "height", msg.Height, "err", err)
		// Still send ack so datum_gateway is not stalled; the error is logged above.
	}

	resp, err := json.Marshal(ackResponse{Status: "ok"})
	if err != nil {
		slog.Error("socket: marshal ack response", "err", err)
		return
	}
	resp = append(resp, '\n')

	if _, err := conn.Write(resp); err != nil {
		slog.Error("socket: write ack response", "err", err)
	}
}
