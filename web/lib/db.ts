import { Pool } from 'pg'

// Singleton pool — reused across all API route invocations.
// Railway's persistent Node.js process keeps this alive between requests.
let pool: Pool | undefined

function getPool(): Pool {
  if (!pool) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL environment variable is not set')

    // Parse manually — pg v8 infers ssl options from the URL's sslmode param
    // and overrides whatever we pass in the config object, so we avoid
    // connectionString entirely and hand pg individual params instead.
    const parsed = new URL(url)
    const noSsl = process.env.DATABASE_NO_SSL === 'true'

    pool = new Pool({
      host:     parsed.hostname,
      port:     Number(parsed.port) || 5432,
      database: parsed.pathname.replace(/^\//, ''),
      user:     decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      ssl: noSsl ? false : { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    })
  }
  return pool
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LeaderboardEntry {
  rank: number
  btcAddress: string
  bestShare: string
  lastSeen: Date
  estimatedPayoutSats: number
  hashrate7dThs: number    // estimated 7-day hashrate in TH/s
}

export interface PoolStats {
  totalBlocks: number
  activeMiners7d: number
  currentRoundStarted: Date
  latestBlockHeight: number | null
}

export interface BlockSummary {
  id: number
  height: number
  foundAt: Date
  finderAddress: string
  blockFeesSats: number
  slotsFilled: number      // how many of the 21 slots were occupied
}

export interface BlockDetail extends BlockSummary {
  hash: string
  coinbaseTxid: string | null
  top21Snapshot: Array<{
    rank: number
    address: string
    amount_sats: number
  }>
}

// ─── Reward constants (mirrored from builder.go) ──────────────────────────────

const FINDER_PERCENT  = 0.021
const POOL_FEE_PERCENT = 0.021
const MAX_RANKED_SLOTS = 21
const SUBSIDY_SATS = 312_500_000  // 3.125 BTC — update at each halving

function calcPayouts(subsidySats: number, feesSats: number, filledSlots: number) {
  const total = subsidySats + feesSats
  const finderSats  = Math.floor(total * FINDER_PERCENT)
  const poolFeeSats = Math.floor(total * POOL_FEE_PERCENT)
  const remaining   = total - finderSats - poolFeeSats
  const perSlot     = Math.floor(remaining / MAX_RANKED_SLOTS)
  return { finderSats, perSlot, poolFeeSats }
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function getLeaderboard(limit = 100): Promise<LeaderboardEntry[]> {
  const db = getPool()

  const roundRow = await db.query<{ id: number }>(
    `SELECT id FROM rounds WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1`
  )
  if (roundRow.rows.length === 0) return []
  const roundId = roundRow.rows[0].id

  const result = await db.query<{
    btc_address: string
    best_share: string
    last_seen: Date
    rank: number
    hashrate_7d_hs: string
  }>(
    `SELECT
       btc_address,
       MAX(share_difficulty)::TEXT                                   AS best_share,
       MAX(submitted_at)                                             AS last_seen,
       RANK() OVER (ORDER BY MAX(share_difficulty) DESC)::INT        AS rank,
       (SUM(share_difficulty) * 4294967296.0 / (7.0 * 86400))::TEXT AS hashrate_7d_hs
     FROM shares
     WHERE round_id = $1
       AND submitted_at > NOW() - INTERVAL '7 days'
       AND is_stale = false
     GROUP BY btc_address
     ORDER BY MAX(share_difficulty) DESC
     LIMIT $2`,
    [roundId, limit]
  )

  const { perSlot } = calcPayouts(SUBSIDY_SATS, 0, result.rows.length)

  return result.rows.map(row => ({
    rank: row.rank,
    btcAddress: row.btc_address,
    bestShare: row.best_share,
    lastSeen: row.last_seen,
    estimatedPayoutSats: perSlot,
    hashrate7dThs: parseFloat(row.hashrate_7d_hs) / 1e12,
  }))
}

export async function getPoolStats(): Promise<PoolStats> {
  const db = getPool()

  const result = await db.query<{
    total_blocks: string
    active_miners_7d: string
    round_started: Date
    latest_height: number | null
  }>(
    `SELECT
       (SELECT COUNT(*)::TEXT FROM blocks) AS total_blocks,
       (SELECT COUNT(DISTINCT btc_address)::TEXT FROM shares
          WHERE submitted_at > NOW() - INTERVAL '7 days') AS active_miners_7d,
       (SELECT started_at FROM rounds WHERE ended_at IS NULL
          ORDER BY started_at DESC LIMIT 1) AS round_started,
       (SELECT height FROM blocks ORDER BY found_at DESC LIMIT 1) AS latest_height`
  )

  const row = result.rows[0]
  return {
    totalBlocks: parseInt(row.total_blocks ?? '0', 10),
    activeMiners7d: parseInt(row.active_miners_7d ?? '0', 10),
    currentRoundStarted: row.round_started,
    latestBlockHeight: row.latest_height ?? null,
  }
}

export interface ExtendedPoolStats extends PoolStats {
  acceptedSharesTotal: string
  bestShareEver: string        // decimal string — BigInt safe
  minTop21Share: string | null // null if fewer than 21 miners in leaderboard
  poolHashrateHs: number       // estimated from last 10 minutes of shares
}

export async function getExtendedPoolStats(): Promise<ExtendedPoolStats> {
  const db = getPool()
  const base = await getPoolStats()

  const result = await db.query<{
    accepted_total: string
    best_ever: string
    min_top21: string | null
    pool_hashrate_hs: string
  }>(
    `WITH best_per_address AS (
       SELECT btc_address,
              MAX(share_difficulty) AS best_share
       FROM shares
       WHERE submitted_at > NOW() - INTERVAL '7 days'
         AND is_stale = false
         AND round_id = (SELECT id FROM rounds WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1)
       GROUP BY btc_address
     ),
     ranked AS (
       SELECT best_share,
              RANK() OVER (ORDER BY best_share DESC) AS rnk
       FROM best_per_address
     )
     SELECT
       (SELECT COUNT(*)::TEXT FROM shares WHERE is_stale = false)          AS accepted_total,
       (SELECT MAX(share_difficulty)::TEXT FROM shares)                    AS best_ever,
       (SELECT MIN(best_share)::TEXT FROM ranked WHERE rnk <= 21)          AS min_top21,
       (SELECT (COALESCE(SUM(share_difficulty), 0) * 4294967296.0 / 600)::TEXT
          FROM shares
          WHERE submitted_at > NOW() - INTERVAL '10 minutes'
            AND is_stale = false)                                           AS pool_hashrate_hs`
  )

  const row = result.rows[0]
  return {
    ...base,
    acceptedSharesTotal: row.accepted_total ?? '0',
    bestShareEver: row.best_ever ?? '0',
    minTop21Share: row.min_top21 ?? null,
    poolHashrateHs: parseFloat(row.pool_hashrate_hs ?? '0'),
  }
}

export async function getBlocks(limit = 20, offset = 0): Promise<BlockSummary[]> {
  const db = getPool()

  const result = await db.query<{
    id: number
    height: number
    found_at: Date
    finder_address: string
    block_fees_sats: string
    top_21_snapshot: Array<{ rank: number; address: string; amount_sats: number }>
  }>(
    `SELECT id, height, found_at, finder_address, block_fees_sats, top_21_snapshot
     FROM blocks
     ORDER BY found_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  )

  return result.rows.map(row => ({
    id: row.id,
    height: row.height,
    foundAt: row.found_at,
    finderAddress: row.finder_address,
    blockFeesSats: parseInt(row.block_fees_sats as unknown as string, 10),
    slotsFilled: Array.isArray(row.top_21_snapshot) ? row.top_21_snapshot.length : 0,
  }))
}

export async function getBlock(height: number): Promise<BlockDetail | null> {
  const db = getPool()

  const result = await db.query<{
    id: number
    height: number
    hash: string
    found_at: Date
    finder_address: string
    coinbase_txid: string | null
    block_fees_sats: string
    top_21_snapshot: Array<{ rank: number; address: string; amount_sats: number }>
  }>(
    `SELECT id, height, hash, found_at, finder_address, coinbase_txid,
            block_fees_sats, top_21_snapshot
     FROM blocks WHERE height = $1 LIMIT 1`,
    [height]
  )

  if (result.rows.length === 0) return null
  const row = result.rows[0]

  return {
    id: row.id,
    height: row.height,
    hash: row.hash,
    foundAt: row.found_at,
    finderAddress: row.finder_address,
    coinbaseTxid: row.coinbase_txid,
    blockFeesSats: parseInt(row.block_fees_sats as unknown as string, 10),
    slotsFilled: Array.isArray(row.top_21_snapshot) ? row.top_21_snapshot.length : 0,
    top21Snapshot: row.top_21_snapshot ?? [],
  }
}

export async function getMinerStats(address: string) {
  const db = getPool()

  const roundRow = await db.query<{ id: number }>(
    `SELECT id FROM rounds WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1`
  )
  const roundId = roundRow.rows[0]?.id

  const [rankResult, historyResult, blockResult] = await Promise.all([
    // Current rank
    db.query<{ rank: number | null; best_share: string | null; last_seen: Date | null }>(
      `SELECT rank, best_share, last_seen FROM (
         SELECT
           btc_address,
           MAX(share_difficulty)::TEXT AS best_share,
           MAX(submitted_at)           AS last_seen,
           RANK() OVER (ORDER BY MAX(share_difficulty) DESC)::INT AS rank
         FROM shares
         WHERE round_id = $1
           AND submitted_at > NOW() - INTERVAL '7 days'
           AND is_stale = false
         GROUP BY btc_address
       ) t WHERE btc_address = $2`,
      [roundId, address]
    ),
    // Share history last 7 days (hourly buckets)
    db.query<{ hour: Date; count: string; best: string }>(
      `SELECT
         DATE_TRUNC('hour', submitted_at) AS hour,
         COUNT(*)::TEXT AS count,
         MAX(share_difficulty)::TEXT AS best
       FROM shares
       WHERE btc_address = $1
         AND submitted_at > NOW() - INTERVAL '7 days'
         AND is_stale = false
       GROUP BY hour ORDER BY hour`,
      [address]
    ),
    // Blocks they appeared in
    db.query<{ height: number; found_at: Date; amount_sats: number }>(
      `SELECT height, found_at,
         (elem->>'amount_sats')::BIGINT AS amount_sats
       FROM blocks,
            jsonb_array_elements(top_21_snapshot) AS elem
       WHERE elem->>'address' = $1
       ORDER BY found_at DESC LIMIT 10`,
      [address]
    ),
  ])

  const { perSlot } = calcPayouts(SUBSIDY_SATS, 0, 21)

  return {
    address,
    currentRank: rankResult.rows[0]?.rank ?? null,
    bestShare: rankResult.rows[0]?.best_share ?? null,
    lastSeen: rankResult.rows[0]?.last_seen ?? null,
    estimatedPayoutSats: rankResult.rows[0] ? perSlot : null,
    shareHistory: historyResult.rows,
    blocksInTop21: blockResult.rows,
  }
}
