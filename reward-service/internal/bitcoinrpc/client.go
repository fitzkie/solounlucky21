package bitcoinrpc

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// Client is a minimal Bitcoin JSON-RPC client.
type Client struct {
	url      string
	user     string
	password string
	http     *http.Client
}

// New creates a Client. url should be e.g. "http://127.0.0.1:8332".
func New(url, user, password string) *Client {
	return &Client{
		url:      url,
		user:     user,
		password: password,
		http:     &http.Client{Timeout: 10 * time.Second},
	}
}

type rpcRequest struct {
	JSONRPC string `json:"jsonrpc"`
	Method  string `json:"method"`
	Params  any    `json:"params"`
	ID      int    `json:"id"`
}

type rpcResponse struct {
	Result json.RawMessage `json:"result"`
	Error  *struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
	} `json:"error"`
}

func (c *Client) call(method string, params any, result any) error {
	body, err := json.Marshal(rpcRequest{JSONRPC: "1.1", Method: method, Params: params, ID: 1})
	if err != nil {
		return err
	}
	req, err := http.NewRequest(http.MethodPost, c.url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.SetBasicAuth(c.user, c.password)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}

	var rpcResp rpcResponse
	if err := json.Unmarshal(data, &rpcResp); err != nil {
		return fmt.Errorf("parse rpc response: %w", err)
	}
	if rpcResp.Error != nil {
		return fmt.Errorf("rpc error %d: %s", rpcResp.Error.Code, rpcResp.Error.Message)
	}

	return json.Unmarshal(rpcResp.Result, result)
}

// GetBlockConfirmations returns the confirmation count for a block hash.
// Returns -1 if the block is on a stale/orphan chain. Returns an error if
// the block hash is not found at all (not yet propagated, wrong hash, etc.).
func (c *Client) GetBlockConfirmations(hash string) (int, error) {
	var header struct {
		Confirmations int `json:"confirmations"`
	}
	if err := c.call("getblockheader", []any{hash, true}, &header); err != nil {
		return 0, err
	}
	return header.Confirmations, nil
}
