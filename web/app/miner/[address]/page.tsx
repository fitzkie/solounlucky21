import { getMinerStats } from '@/lib/db'
import { formatBTC, formatHashrate, formatBestShare, timeAgo } from '@/lib/format'

function timeUntilExpiry(lastSeen: Date | null): { label: string; urgent: boolean } {
  if (!lastSeen) return { label: '—', urgent: false }
  const msRemaining = new Date(lastSeen).getTime() + 7 * 24 * 60 * 60 * 1000 - Date.now()
  if (msRemaining <= 0) return { label: 'Expired', urgent: true }
  const days = Math.floor(msRemaining / (24 * 60 * 60 * 1000))
  const hours = Math.floor((msRemaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000))
  const mins = Math.floor((msRemaining % (60 * 60 * 1000)) / (60 * 1000))
  const urgent = msRemaining < 24 * 60 * 60 * 1000
  if (days > 0) return { label: `${days}d ${hours}h`, urgent: days < 2 }
  return { label: `${hours}h ${mins}m`, urgent: true }
}

export const revalidate = 30

export default async function MinerDetailPage({
  params,
}: {
  params: Promise<{ address: string }>
}) {
  const { address } = await params
  const stats = await getMinerStats(decodeURIComponent(address))

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-black">My Stats</h1>
        <p className="font-mono text-xs text-white/40 mt-2 break-all">{address}</p>
      </div>

      {!stats.currentRank ? (
        <div className="rounded-xl border border-white/10 p-12 text-center space-y-2">
          <p className="text-white/40 text-sm">This address is not on the current leaderboard.</p>
          <p className="text-white/25 text-xs">
            Connect your miner to start earning a rank.{' '}
            <a href="/connect" className="text-yellow-500 hover:underline">How to connect →</a>
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {(() => {
            const expiry = timeUntilExpiry(stats.lastSeen)
            return [
              { label: 'Current Rank',             value: `#${stats.currentRank}`,                                               color: 'text-yellow-400', urgent: false },
              { label: 'Best Share',               value: formatBestShare(stats.bestShare ?? '0'),                               color: 'text-yellow-400', urgent: false },
              { label: 'Est. Payout if Found Now', value: stats.estimatedPayoutSats ? formatBTC(stats.estimatedPayoutSats) : '—', color: 'text-yellow-400', urgent: false },
              { label: 'Est. Hashrate (7d)',       value: stats.hashrate7dThs != null ? formatHashrate(stats.hashrate7dThs * 1e12) : '—', color: 'text-yellow-400', urgent: false },
              { label: 'Last Active',              value: stats.lastSeen ? timeAgo(stats.lastSeen) : '—',                       color: 'text-yellow-400', urgent: false },
              { label: 'Rank Expires In',          value: expiry.label,                                                         color: expiry.urgent ? 'text-red-400' : 'text-yellow-400', urgent: expiry.urgent },
            ]
          })().map(s => (
            <div key={s.label} className={`bg-white/5 rounded-xl p-4 border ${s.urgent ? 'border-red-500/30' : 'border-white/10'}`}>
              <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
              <div className="text-xs text-white/40 mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {stats.shareHistory.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-widest text-white/40">
            Share Activity — Last 7 Days (by hour)
          </h2>
          <div className="rounded-xl border border-white/10 overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-white/5 border-b border-white/10 text-white/40">
                  <th className="text-left px-4 py-2">Hour (UTC)</th>
                  <th className="text-right px-4 py-2">Shares</th>
                  <th className="text-right px-4 py-2">Best Share</th>
                </tr>
              </thead>
              <tbody>
                {[...stats.shareHistory].reverse().slice(0, 48).map((row, i) => (
                  <tr key={i} className="border-b border-white/5 hover:bg-white/5">
                    <td className="px-4 py-2 font-mono text-white/50">
                      {new Date(row.hour).toISOString().slice(0, 16).replace('T', ' ')}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{row.count}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-yellow-400/70">
                      {formatBestShare(row.best ?? '0')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {stats.blocksInTop21.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-widest text-white/40">
            Blocks in Top 21
          </h2>
          <div className="rounded-xl border border-white/10 overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-white/5 border-b border-white/10 text-white/40">
                  <th className="text-left px-4 py-2">Height</th>
                  <th className="text-left px-4 py-2">Found</th>
                  <th className="text-right px-4 py-2">Payout</th>
                </tr>
              </thead>
              <tbody>
                {stats.blocksInTop21.map((b, i) => (
                  <tr key={i} className="border-b border-white/5 hover:bg-white/5">
                    <td className="px-4 py-2 font-mono font-bold text-yellow-400">
                      {b.height.toLocaleString()}
                    </td>
                    <td className="px-4 py-2 text-white/40">{timeAgo(b.found_at)}</td>
                    <td className="px-4 py-2 text-right text-yellow-400">
                      {formatBTC(b.amount_sats)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
