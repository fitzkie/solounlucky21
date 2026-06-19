export interface ExternalStats {
  btcPriceUsd: number | null
  networkHashrateHs: number | null
  networkDifficulty: number | null
  fetchedAt: number
}

let _cache: ExternalStats | null = null
let _inflight: Promise<ExternalStats> | null = null
const TTL = 60_000

async function _fetchExternal(): Promise<ExternalStats> {
  const [priceResult, hashrateResult] = await Promise.allSettled([
    fetch('https://mempool.space/api/v1/prices', { cache: 'no-store' }),
    fetch('https://mempool.space/api/v1/mining/hashrate/1m', { cache: 'no-store' }),
  ])

  let btcPriceUsd: number | null = null
  let networkHashrateHs: number | null = null
  let networkDifficulty: number | null = null

  try {
    if (priceResult.status === 'fulfilled' && priceResult.value.ok) {
      const d = await priceResult.value.json()
      btcPriceUsd = typeof d.USD === 'number' ? d.USD : null
    }
  } catch { /* leave null */ }

  try {
    if (hashrateResult.status === 'fulfilled' && hashrateResult.value.ok) {
      const d = await hashrateResult.value.json()
      networkHashrateHs = typeof d.currentHashrate === 'number' ? d.currentHashrate : null
      networkDifficulty = typeof d.currentDifficulty === 'number' ? d.currentDifficulty : null
    }
  } catch { /* leave null */ }

  _cache = { btcPriceUsd, networkHashrateHs, networkDifficulty, fetchedAt: Date.now() }
  return _cache
}

export async function getExternalStats(): Promise<ExternalStats> {
  if (_cache && Date.now() - _cache.fetchedAt < TTL) return _cache
  if (_inflight) return _inflight
  _inflight = _fetchExternal().finally(() => { _inflight = null })
  return _inflight
}
