/*
 * datum_reward_socket_example.c
 *
 * Minimal standalone example showing how datum_gateway uses the
 * datum_request_coinbase_outputs() API.
 *
 * Build (from datum-gateway/src/):
 *   gcc -Wall -Wextra -o reward_example \
 *       datum_reward_socket_example.c datum_reward_socket.c
 *
 * Run (reward service must be listening at /var/run/unlucky21/reward.sock):
 *   ./reward_example bc1qyouraddresshere 312500          # mainnet address, fees in sats
 *   ./reward_example bc1qtest 0                          # zero-fee block
 *
 * Run without the reward service to observe the fallback path:
 *   (stop the Go service, then run the example)
 */

#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <string.h>

#include "datum_reward_socket.h"

/* Simulated full block reward (subsidy + fees) used to demonstrate the -1
 * "give full reward" signal.  In production datum_gateway code this comes
 * from the block template (coinbase_value field of getblocktemplate). */
#define EXAMPLE_SUBSIDY_SATS  312500000LL   /* 3.125 BTC after 4th halving */

/* --------------------------------------------------------------------------
 * print_outputs
 * Dumps the output list to stdout.  Demonstrates how datum_gateway would
 * iterate the list returned by datum_request_coinbase_outputs().
 * -------------------------------------------------------------------------- */
static void print_outputs(const reward_output_list_t *list, int64_t total_sats)
{
    int i;

    printf("  output count : %d\n", list->count);
    printf("  %-62s  %s\n", "address", "amount_sats");
    printf("  %-62s  %s\n",
           "--------------------------------------------------------------",
           "-----------");

    for (i = 0; i < list->count; i++) {
        int64_t sats = list->outputs[i].amount_sats;

        if (sats == -1) {
            /* -1 is the "full block reward" signal: the reward service is
             * telling datum_gateway to assign the entire remaining reward to
             * this address.  This is used when a miner is not in the pool
             * roster — they win the full solo payout. */
            printf("  %-62s  %lld  (full reward: %lld sats)\n",
                   list->outputs[i].address,
                   (long long)sats,
                   (long long)total_sats);
        } else {
            printf("  %-62s  %lld\n",
                   list->outputs[i].address,
                   (long long)sats);
        }
    }
}

/* --------------------------------------------------------------------------
 * simulate_coinbase_build
 *
 * Mirrors what datum_gateway's coinbase-building function does after the
 * unlucky21 hook is injected.  Shows both the success path and the fallback.
 * -------------------------------------------------------------------------- */
static void simulate_coinbase_build(const char *miner_address,
                                    int64_t fees_sats)
{
    reward_output_list_t outputs;
    int use_unlucky21 = 0;
    int64_t total_sats = EXAMPLE_SUBSIDY_SATS + fees_sats;
    int n;

    printf("=== Simulating coinbase build ===\n");
    printf("  miner address : %s\n", miner_address);
    printf("  fees          : %lld sats\n", (long long)fees_sats);
    printf("  total reward  : %lld sats  (subsidy %lld + fees %lld)\n\n",
           (long long)total_sats,
           (long long)EXAMPLE_SUBSIDY_SATS,
           (long long)fees_sats);

    /* ---- BEGIN unlucky21 reward hook (mirrors INTEGRATION.md Step 3) ---- */
    memset(&outputs, 0, sizeof(outputs));

    n = datum_request_coinbase_outputs(miner_address, fees_sats, &outputs);
    if (n > 0) {
        use_unlucky21 = 1;
    }
    /* ---- END unlucky21 reward hook ---- */

    if (use_unlucky21) {
        int i;

        printf("Hook active — using reward service outputs:\n");
        print_outputs(&outputs, total_sats);
        printf("\nCoinbase outputs that would be written:\n");

        for (i = 0; i < outputs.count; i++) {
            int64_t sats = outputs.outputs[i].amount_sats;

            if (sats == -1) {
                /* Solo fallback signal: give the full block reward to this
                 * miner.  datum_gateway should use total_sats here. */
                sats = total_sats;
                printf("  [%d] SOLO FALLBACK  address=%s  amount=%lld sats\n",
                       i, outputs.outputs[i].address, (long long)sats);
            } else {
                printf("  [%d] address=%-62s  amount=%lld sats\n",
                       i, outputs.outputs[i].address, (long long)sats);
            }
        }

    } else {
        /*
         * Go reward service unavailable.
         * datum_gateway falls back to its normal single-output coinbase:
         * full block reward goes to the miner's address unchanged.
         */
        printf("Hook inactive (service unavailable) — fallback coinbase:\n");
        printf("  [0] address=%-62s  amount=%lld sats  (full solo reward)\n",
               miner_address,
               (long long)total_sats);
        printf("\n  datum_gateway proceeds with its existing single-output\n");
        printf("  coinbase code.  No miners are disrupted.\n");
    }

    printf("\n");
}

/* --------------------------------------------------------------------------
 * main
 * -------------------------------------------------------------------------- */
int main(int argc, char *argv[])
{
    const char *miner_address;
    int64_t     fees_sats;

    if (argc < 3) {
        fprintf(stderr,
                "Usage: %s <btc_address> <fees_sats>\n\n"
                "Examples:\n"
                "  %s bc1qyouraddresshere 312500\n"
                "  %s bc1qtest 0\n\n"
                "The reward service must be running at %s\n"
                "to exercise the success path.  Stop it to test the fallback.\n",
                argv[0], argv[0], argv[0], REWARD_SOCKET_PATH);
        return 1;
    }

    miner_address = argv[1];
    fees_sats     = (int64_t)atoll(argv[2]);

    simulate_coinbase_build(miner_address, fees_sats);

    /* Second call with zero fees — shows pool splits on subsidy-only block */
    if (fees_sats != 0) {
        printf("--- Zero-fee block (subsidy only) ---\n");
        simulate_coinbase_build(miner_address, 0);
    }

    return 0;
}
