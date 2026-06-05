import { getMinerStats } from '@/lib/db'
import { formatBTC, timeAgo } from '@/lib/format'

export const dynamic = 'force-dynamic'

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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Current Rank',            value: `#${stats.currentRank}` },
            { label: 'Best Share (7d)',          value: stats.bestShare ? BigInt(stats.bestShare).toLocaleString() : '—' },
            { label: 'Last Active',             value: stats.lastSeen ? timeAgo(stats.lastSeen) : '—' },
            { label: 'Est. Payout if Found Now', value: stats.estimatedPayoutSats ? formatBTC(stats.estimatedPayoutSats) : '—' },
          ].map(s => (
            <div key={s.label} className="bg-white/5 rounded-xl p-4 border border-white/10">
              <div className="text-2xl font-black text-yellow-400">{s.value}</div>
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
                  <th className="text-right px-4 py-2">Best Difficulty</th>
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
                      {BigInt(row.best ?? '0').toLocaleString()}
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
