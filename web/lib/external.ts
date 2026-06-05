export interface ExternalStats {
  btcPriceUsd: number | null
  networkHashrateHs: number | null
  networkDifficulty: number | null
  fetchedAt: number
}

let _cache: ExternalStats | null = null
const TTL = 60_000

export async function getExternalStats(): Promise<ExternalStats> {
  if (_cache && Date.now() - _cache.fetchedAt < TTL) return _cache

  let btcPriceUsd: number | null = null
  let networkHashrateHs: number | null = null
  let networkDifficulty: number | null = null

  try {
    const r = await fetch('https://mempool.space/api/v1/prices', { cache: 'no-store' })
    if (r.ok) {
      const d = await r.json()
      btcPriceUsd = typeof d.USD === 'number' ? d.USD : null
    }
  } catch { /* leave null */ }

  try {
    const r = await fetch('https://mempool.space/signet/api/v1/mining/hashrate/1m', { cache: 'no-store' })
    if (r.ok) {
      const d = await r.json()
      networkHashrateHs = typeof d.currentHashrate === 'number' ? d.currentHashrate : null
      networkDifficulty = typeof d.currentDifficulty === 'number' ? d.currentDifficulty : null
    }
  } catch { /* leave null */ }

  _cache = { btcPriceUsd, networkHashrateHs, networkDifficulty, fetchedAt: Date.now() }
  return _cache
}
