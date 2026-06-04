/*
 * datum_reward_socket.c
 *
 * Unix socket client for the Unlucky21 Go reward service.
 * Connects to REWARD_SOCKET_PATH, sends a JSON coinbase request, and parses
 * the JSON response into a reward_output_list_t for coinbase construction.
 *
 * On any error the function returns -1; datum_gateway must fall back to a
 * single-output (solo) coinbase in that case.
 */

#include <sys/socket.h>
#include <sys/un.h>
#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <stdint.h>

#include "datum_reward_socket.h"

#define RESPONSE_BUF_SIZE 16384

/* --------------------------------------------------------------------------
 * is_valid_btc_address
 *
 * Validates that the miner-supplied address is safe to interpolate into JSON.
 * Accepts only ASCII alphanumeric characters; no quotes, backslashes, or
 * whitespace that could break out of the JSON string field.
 *
 * Returns 1 if valid, 0 if invalid.
 * -------------------------------------------------------------------------- */
static int is_valid_btc_address(const char *addr)
{
    size_t len;
    size_t i;

    if (addr == NULL) {
        return 0;
    }

    len = strlen(addr);
    if (len == 0 || len >= REWARD_ADDR_LEN) {
        return 0;
    }

    for (i = 0; i < len; i++) {
        char c = addr[i];
        if (!((c >= 'a' && c <= 'z') ||
              (c >= 'A' && c <= 'Z') ||
              (c >= '0' && c <= '9'))) {
            return 0;
        }
    }

    return 1;
}

/* --------------------------------------------------------------------------
 * parse_coinbase_response
 *
 * Minimal in-place JSON scanner for the reward service response format:
 *   {"outputs":[{"address":"bc1q...","amount_sats":50000000},...]}
 *
 * Does NOT modify the input buffer.  Uses only pointer arithmetic and
 * standard string functions — no external JSON library required.
 *
 * Returns: number of outputs parsed (>= 0) on success
 *          -1 if the "outputs" key is missing or the JSON is malformed
 * -------------------------------------------------------------------------- */
static int parse_coinbase_response(const char *json, reward_output_list_t *result)
{
    const char *p;
    const char *bracket;
    int count = 0;

    if (json == NULL || result == NULL) {
        return -1;
    }

    /* Locate "outputs" key */
    p = strstr(json, "\"outputs\"");
    if (p == NULL) {
        return -1;
    }
    p += strlen("\"outputs\"");

    /* Advance to '[' */
    bracket = strchr(p, '[');
    if (bracket == NULL) {
        return -1;
    }
    p = bracket + 1;

    while (count < REWARD_MAX_OUTPUTS) {
        const char *obj_start;
        const char *addr_key;
        const char *addr_val_start;
        const char *addr_val_end;
        const char *sats_key;
        const char *sats_val_start;
        size_t addr_len;

        /* Skip whitespace / commas to find next object or end-of-array */
        while (*p == ' ' || *p == '\t' || *p == '\n' || *p == '\r' || *p == ',') {
            p++;
        }

        if (*p == ']' || *p == '\0') {
            /* End of array */
            break;
        }

        if (*p != '{') {
            /* Unexpected character — malformed JSON, bail */
            return -1;
        }
        obj_start = p;
        p++; /* consume '{' */

        /* --- Extract "address" value --- */
        addr_key = strstr(p, "\"address\"");
        if (addr_key == NULL) {
            return -1;
        }
        /* Advance past the key and the colon+quote: "address": " */
        addr_val_start = strchr(addr_key + strlen("\"address\""), '"');
        if (addr_val_start == NULL) {
            return -1;
        }
        addr_val_start++; /* skip opening quote */

        addr_val_end = strchr(addr_val_start, '"');
        if (addr_val_end == NULL) {
            return -1;
        }

        addr_len = (size_t)(addr_val_end - addr_val_start);
        if (addr_len == 0 || addr_len >= REWARD_ADDR_LEN) {
            return -1;
        }

        strncpy(result->outputs[count].address,
                addr_val_start,
                addr_len);
        result->outputs[count].address[addr_len] = '\0';

        /* --- Extract "amount_sats" value --- */
        sats_key = strstr(p, "\"amount_sats\"");
        if (sats_key == NULL) {
            return -1;
        }
        /* Skip past key, colon, and any whitespace */
        sats_val_start = strchr(sats_key + strlen("\"amount_sats\""), ':');
        if (sats_val_start == NULL) {
            return -1;
        }
        sats_val_start++; /* skip ':' */
        while (*sats_val_start == ' ' || *sats_val_start == '\t') {
            sats_val_start++;
        }
        if (*sats_val_start == '\0') {
            return -1;
        }

        result->outputs[count].amount_sats = (int64_t)atoll(sats_val_start);

        count++;

        /* Advance p past the closing '}' of this object.
         * We search from obj_start to avoid re-scanning from the top. */
        p = strchr(obj_start, '}');
        if (p == NULL) {
            return -1;
        }
        p++; /* consume '}' */
    }

    result->count = count;
    return count;
}

/* --------------------------------------------------------------------------
 * datum_request_coinbase_outputs  (public)
 *
 * Opens a fresh Unix-domain socket connection to the Go reward service,
 * sends the coinbase JSON request, reads the response, and parses it.
 *
 * A new connection is made for every call (keep-alive is not required at the
 * current call rate — one per new block template).
 *
 * Returns: number of outputs (> 0) on success
 *          -1 on any error (socket, I/O, parse, or validation failure)
 * -------------------------------------------------------------------------- */
int datum_request_coinbase_outputs(
    const char           *miner_address,
    int64_t               fees_sats,
    reward_output_list_t *result)
{
    int fd = -1;
    struct sockaddr_un addr;
    struct timeval tv;
    char request[256];
    char response[RESPONSE_BUF_SIZE];
    int req_len;
    ssize_t n;
    ssize_t total;
    int ret;

    /* --- Input validation --- */
    if (miner_address == NULL || result == NULL) {
        return -1;
    }

    if (!is_valid_btc_address(miner_address)) {
        return -1;
    }

    /* --- Build request --- */
    req_len = snprintf(request, sizeof(request),
                       "{\"type\":\"coinbase\",\"miner_address\":\"%s\","
                       "\"fees_sats\":%lld}\n",
                       miner_address,
                       (long long)fees_sats);
    if (req_len <= 0 || req_len >= (int)sizeof(request)) {
        return -1;
    }

    /* --- Create socket --- */
    fd = socket(AF_UNIX, SOCK_STREAM, 0);
    if (fd < 0) {
        return -1;
    }

    /* --- Set send / receive timeouts (500 ms) --- */
    tv.tv_sec  = 0;
    tv.tv_usec = 500000;

    if (setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof(tv)) < 0) {
        close(fd);
        return -1;
    }
    if (setsockopt(fd, SOL_SOCKET, SO_SNDTIMEO, &tv, sizeof(tv)) < 0) {
        close(fd);
        return -1;
    }

    /* --- Connect --- */
    memset(&addr, 0, sizeof(addr));
    addr.sun_family = AF_UNIX;
    strncpy(addr.sun_path, REWARD_SOCKET_PATH, sizeof(addr.sun_path) - 1);
    addr.sun_path[sizeof(addr.sun_path) - 1] = '\0';

    if (connect(fd, (struct sockaddr *)&addr, sizeof(addr)) < 0) {
        close(fd);
        return -1;
    }

    /* --- Send request --- */
    n = write(fd, request, (size_t)req_len);
    if (n != (ssize_t)req_len) {
        close(fd);
        return -1;
    }

    /* --- Read response (accumulate until newline or buffer full) --- */
    total = 0;
    memset(response, 0, sizeof(response));

    while (total < (ssize_t)(sizeof(response) - 1)) {
        n = read(fd, response + total, sizeof(response) - 1 - (size_t)total);
        if (n < 0) {
            /* EAGAIN / EWOULDBLOCK = timeout */
            close(fd);
            return -1;
        }
        if (n == 0) {
            /* EOF — server closed connection */
            break;
        }
        total += n;

        /* Stop once we have the terminating newline */
        if (memchr(response, '\n', (size_t)total) != NULL) {
            break;
        }
    }

    close(fd);
    fd = -1;

    if (total <= 0) {
        return -1;
    }

    /* Ensure NUL-termination before string scanning */
    response[total] = '\0';

    /* --- Parse response --- */
    memset(result, 0, sizeof(*result));
    ret = parse_coinbase_response(response, result);
    if (ret < 0) {
        return -1;
    }

    return ret;
}


/* ── UNLUCKY21: fire-and-forget share submit ─────────────────────────────── */
void datum_reward_share_submit(const char *username, uint64_t difficulty, int is_stale) {
    int fd;
    struct sockaddr_un addr;
    char req[384];
    char btc_addr[REWARD_ADDR_LEN] = {0};
    char worker[64]                = {0};

    if (!username || difficulty == 0) return;

    const char *dot = strchr(username, '.');
    if (dot) {
        size_t n = (size_t)(dot - username);
        if (n >= REWARD_ADDR_LEN) n = REWARD_ADDR_LEN - 1;
        strncpy(btc_addr, username, n);
        strncpy(worker, dot + 1, 63);
    } else {
        strncpy(btc_addr, username, REWARD_ADDR_LEN - 1);
    }

    fd = socket(AF_UNIX, SOCK_STREAM | SOCK_NONBLOCK, 0);
    if (fd < 0) return;

    struct timeval tv = {0, 20000}; /* 20ms max */
    setsockopt(fd, SOL_SOCKET, SO_SNDTIMEO, &tv, sizeof(tv));

    memset(&addr, 0, sizeof(addr));
    addr.sun_family = AF_UNIX;
    strncpy(addr.sun_path, REWARD_SOCKET_PATH, sizeof(addr.sun_path) - 1);

    if (connect(fd, (struct sockaddr *)&addr, sizeof(addr)) < 0) { close(fd); return; }

    snprintf(req, sizeof(req),
        "{\"type\":\"share\",\"btc_address\":\"%s\",\"worker_name\":\"%s\","
        "\"difficulty\":\"%llu\",\"is_stale\":%s}\n",
        btc_addr, worker, (unsigned long long)difficulty,
        is_stale ? "true" : "false");

    (void)write(fd, req, strlen(req));
    close(fd);
}

/* ── UNLUCKY21: notify Go service that a block was found ─────────────────── */
void datum_reward_block_found(int32_t height, const char *hash_hex, const char *finder_addr) {
    int fd;
    struct sockaddr_un addr;
    char req[512];
    char resp[64];

    if (!hash_hex || !finder_addr) return;

    fd = socket(AF_UNIX, SOCK_STREAM, 0);
    if (fd < 0) return;

    struct timeval tv = {2, 0}; /* 2s — wait for ack */
    setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof(tv));
    setsockopt(fd, SOL_SOCKET, SO_SNDTIMEO, &tv, sizeof(tv));

    memset(&addr, 0, sizeof(addr));
    addr.sun_family = AF_UNIX;
    strncpy(addr.sun_path, REWARD_SOCKET_PATH, sizeof(addr.sun_path) - 1);

    if (connect(fd, (struct sockaddr *)&addr, sizeof(addr)) < 0) { close(fd); return; }

    /* Parse finder address (strip worker suffix if present) */
    char btc_addr[REWARD_ADDR_LEN] = {0};
    const char *dot = strchr(finder_addr, '.');
    if (dot) {
        size_t n = (size_t)(dot - finder_addr);
        if (n >= REWARD_ADDR_LEN) n = REWARD_ADDR_LEN - 1;
        strncpy(btc_addr, finder_addr, n);
    } else {
        strncpy(btc_addr, finder_addr, REWARD_ADDR_LEN - 1);
    }

    snprintf(req, sizeof(req),
        "{\"type\":\"block_found\",\"height\":%d,\"hash\":\"%s\","
        "\"finder_address\":\"%s\",\"coinbase_txid\":\"\",\"fees_sats\":0}\n",
        height, hash_hex, btc_addr);

    (void)write(fd, req, strlen(req));
    (void)read(fd, resp, sizeof(resp) - 1); /* wait for {"status":"ok"} */
    close(fd);
}
