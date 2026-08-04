package socket

import (
	"bufio"
	"encoding/json"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"
)

// --- inline mock ---

type mockHandler struct {
	mu sync.Mutex

	// configurable responses
	coinbaseOutputs []Output
	coinbaseErr     error
	blockFoundErr   error

	// recorded calls
	recordShareCalls []recordShareCall
	blockFoundCalls  []blockFoundCall
}

type recordShareCall struct {
	btcAddress string
	workerName string
	difficulty string
	trueDiff   float64
	sourcePort int
}

type blockFoundCall struct {
	height        int32
	hash          string
	finderAddress string
	coinbaseTxID  string
	feesSats      int64
}

func (m *mockHandler) GetCoinbaseOutputs(minerAddress string, feesSats int64) ([]Output, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.coinbaseErr != nil {
		return nil, m.coinbaseErr
	}
	if m.coinbaseOutputs != nil {
		return m.coinbaseOutputs, nil
	}
	// Default: return a single output for the miner.
	return []Output{{Address: minerAddress, AmountSats: 50_000_000}}, nil
}

func (m *mockHandler) RecordShare(btcAddress, workerName, difficulty string, trueDiff float64, sourcePort int) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.recordShareCalls = append(m.recordShareCalls, recordShareCall{
		btcAddress: btcAddress,
		workerName: workerName,
		difficulty: difficulty,
		trueDiff:   trueDiff,
		sourcePort: sourcePort,
	})
	return nil
}

func (m *mockHandler) BlockFound(height int32, hash, finderAddress, coinbaseTxID string, feesSats int64) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.blockFoundCalls = append(m.blockFoundCalls, blockFoundCall{
		height:        height,
		hash:          hash,
		finderAddress: finderAddress,
		coinbaseTxID:  coinbaseTxID,
		feesSats:      feesSats,
	})
	return m.blockFoundErr
}

func (m *mockHandler) recordShareCallCount() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.recordShareCalls)
}

func (m *mockHandler) lastRecordShare() (recordShareCall, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if len(m.recordShareCalls) == 0 {
		return recordShareCall{}, false
	}
	return m.recordShareCalls[len(m.recordShareCalls)-1], true
}

func (m *mockHandler) lastBlockFound() (blockFoundCall, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if len(m.blockFoundCalls) == 0 {
		return blockFoundCall{}, false
	}
	return m.blockFoundCalls[len(m.blockFoundCalls)-1], true
}

// --- helpers ---

// startTestServer starts a Server on a temp socket path and returns the path.
// It spawns the server in a goroutine and waits briefly for it to be ready.
func startTestServer(t *testing.T, h Handler) string {
	t.Helper()
	sockPath := filepath.Join(t.TempDir(), "test.sock")
	srv := NewServer(sockPath, h)

	ready := make(chan struct{})

	go func() {
		// Signal ready by polling until the socket file appears.
		go func() {
			for i := 0; i < 50; i++ {
				if _, err := os.Stat(sockPath); err == nil {
					close(ready)
					return
				}
				time.Sleep(10 * time.Millisecond)
			}
			// If we never saw the file, close anyway to unblock the test.
			close(ready)
		}()
		if err := srv.Listen(); err != nil {
			// Expected when test ends and socket file is removed.
			_ = err
		}
	}()

	<-ready
	return sockPath
}

// dialAndSend opens a connection to sockPath, sends msg as newline-terminated JSON,
// and returns the raw response line (without the trailing newline).
// If readResponse is false, it returns "" without reading.
func dialAndSend(t *testing.T, sockPath string, msg interface{}, readResponse bool) string {
	t.Helper()

	conn, err := net.Dial("unix", sockPath)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	defer conn.Close()

	data, err := json.Marshal(msg)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	data = append(data, '\n')

	if _, err := conn.Write(data); err != nil {
		t.Fatalf("write: %v", err)
	}

	if !readResponse {
		return ""
	}

	conn.SetDeadline(time.Now().Add(2 * time.Second))
	scanner := bufio.NewScanner(conn)
	if scanner.Scan() {
		return scanner.Text()
	}
	if err := scanner.Err(); err != nil {
		t.Fatalf("read response: %v", err)
	}
	t.Fatal("no response received")
	return ""
}

// --- tests ---

func TestServer_CoinbaseRequest(t *testing.T) {
	h := &mockHandler{}
	sockPath := startTestServer(t, h)

	minerAddr := "bc1qmineraddress123"
	req := map[string]interface{}{
		"type":          "coinbase",
		"miner_address": minerAddr,
		"fees_sats":     int64(1_250_000),
	}

	raw := dialAndSend(t, sockPath, req, true)

	var resp coinbaseResponse
	if err := json.Unmarshal([]byte(raw), &resp); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if len(resp.Outputs) == 0 {
		t.Fatal("expected non-empty outputs array")
	}
	if resp.Outputs[0].Address != minerAddr {
		t.Errorf("first output address = %q, want %q", resp.Outputs[0].Address, minerAddr)
	}
}

func TestServer_ShareSubmit(t *testing.T) {
	h := &mockHandler{}
	sockPath := startTestServer(t, h)

	req := map[string]interface{}{
		"type":             "share",
		"btc_address":     "bc1qworker456",
		"worker_name":     "rig1",
		"difficulty":      "4831838208",
		"true_difficulty": float64(4831838208),
		"source_port":     3333,
	}

	// Fire-and-forget: no response expected.
	dialAndSend(t, sockPath, req, false)

	// Give the async goroutine time to run.
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if h.recordShareCallCount() > 0 {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}

	call, ok := h.lastRecordShare()
	if !ok {
		t.Fatal("RecordShare was not called")
	}
	if call.btcAddress != "bc1qworker456" {
		t.Errorf("btcAddress = %q, want %q", call.btcAddress, "bc1qworker456")
	}
	if call.workerName != "rig1" {
		t.Errorf("workerName = %q, want %q", call.workerName, "rig1")
	}
	if call.difficulty != "4831838208" {
		t.Errorf("difficulty = %q, want %q", call.difficulty, "4831838208")
	}
	if call.sourcePort != 3333 {
		t.Errorf("sourcePort = %d, want 3333", call.sourcePort)
	}
}

func TestServer_BlockFound(t *testing.T) {
	h := &mockHandler{}
	sockPath := startTestServer(t, h)

	req := map[string]interface{}{
		"type":           "block_found",
		"height":         int32(840001),
		"hash":           "0000000000000000000abcdef",
		"finder_address": "bc1qfinder789",
		"coinbase_txid":  "abcdef1234567890",
		"fees_sats":      int64(0),
	}

	raw := dialAndSend(t, sockPath, req, true)

	var ack ackResponse
	if err := json.Unmarshal([]byte(raw), &ack); err != nil {
		t.Fatalf("unmarshal ack: %v", err)
	}
	if ack.Status != "ok" {
		t.Errorf("status = %q, want %q", ack.Status, "ok")
	}

	call, ok := h.lastBlockFound()
	if !ok {
		t.Fatal("BlockFound was not called")
	}
	if call.height != 840001 {
		t.Errorf("height = %d, want 840001", call.height)
	}
	if call.hash != "0000000000000000000abcdef" {
		t.Errorf("hash = %q, want %q", call.hash, "0000000000000000000abcdef")
	}
	if call.finderAddress != "bc1qfinder789" {
		t.Errorf("finderAddress = %q, want %q", call.finderAddress, "bc1qfinder789")
	}
	if call.coinbaseTxID != "abcdef1234567890" {
		t.Errorf("coinbaseTxID = %q, want %q", call.coinbaseTxID, "abcdef1234567890")
	}
}

func TestServer_FallbackOnHandlerError(t *testing.T) {
	h := &mockHandler{
		coinbaseErr: fmt.Errorf("database unavailable"),
	}
	sockPath := startTestServer(t, h)

	minerAddr := "bc1qsolominer"
	req := map[string]interface{}{
		"type":          "coinbase",
		"miner_address": minerAddr,
		"fees_sats":     int64(0),
	}

	raw := dialAndSend(t, sockPath, req, true)

	var resp coinbaseResponse
	if err := json.Unmarshal([]byte(raw), &resp); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if len(resp.Outputs) != 1 {
		t.Fatalf("expected 1 fallback output, got %d", len(resp.Outputs))
	}
	if resp.Outputs[0].Address != minerAddr {
		t.Errorf("fallback address = %q, want %q", resp.Outputs[0].Address, minerAddr)
	}
	if resp.Outputs[0].AmountSats != -1 {
		t.Errorf("fallback amount_sats = %d, want -1", resp.Outputs[0].AmountSats)
	}
}
