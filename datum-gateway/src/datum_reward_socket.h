/*
 * datum_reward_socket.h
 *
 * Unix socket client for the SoloUnlucky21 Go reward service.
 * datum_gateway calls datum_request_coinbase_outputs() before building
 * each miner's block template. Returns -1 if the Go service is unavailable —
 * the caller MUST fall back to single-output (solo) coinbase in that case.
 */
#ifndef DATUM_REWARD_SOCKET_H
#define DATUM_REWARD_SOCKET_H

#include <stdint.h>

#define REWARD_SOCKET_PATH  "/var/run/unlucky21/reward.sock"
#define REWARD_MAX_OUTPUTS  30
#define REWARD_ADDR_LEN     91   /* covers bech32m (Taproot) addresses safely */

typedef struct {
    char    address[REWARD_ADDR_LEN];
    int64_t amount_sats;          /* -1 signals "give full reward" to caller */
} reward_output_t;

typedef struct {
    reward_output_t outputs[REWARD_MAX_OUTPUTS];
    int             count;
} reward_output_list_t;

/*
 * Request coinbase outputs from the Go reward service.
 *
 * miner_address  BTC address of the miner requesting this template.
 *                Goes into coinbase output slot 0 (finder bonus).
 * fees_sats      Transaction fees in this block template.
 * result         Populated on success with ordered output list.
 *
 * Returns: number of outputs (>0) on success
 *          -1 if Go service is unavailable or timed out (use solo fallback)
 */
int datum_request_coinbase_outputs(
    const char           *miner_address,
    int64_t               fees_sats,
    reward_output_list_t *result
);

#endif /* DATUM_REWARD_SOCKET_H */
