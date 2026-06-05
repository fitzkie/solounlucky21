import { getLeaderboard, getPoolStats } from '@/lib/db'

export const dynamic = 'force-dynamic'

function formatBTC(sats: number): string {
  return (sats / 100_000_000).toFixed(4) + ' BTC'
}

function truncate(addr: string): string {
  return addr.length > 20 ? addr.slice(0, 10) + '…' + addr.slice(-8) : addr
}

function timeAgo(date: Date): string {
  const secs = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (secs < 60) return `${secs}s ago`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  return `${Math.floor(secs / 86400)}d ago`
}

export default async function HomePage() {
  const [leaderboard, stats] = await Promise.all([getLeaderboard(), getPoolStats()])

  return (
    <div className="space-y-10">

      {/* Hero */}
      <section className="text-center py-8">
        <h1 className="text-4xl font-bold tracking-tight mb-3">
          Don&apos;t find the block.{' '}
          <span className="text-yellow-400">Make the list.</span>
        </h1>
        <p className="text-white/50 text-lg max-w-xl mx-auto">
          Solo Bitcoin mining pool. 95.8% of every block reward splits equally
          among the top&nbsp;21 best-share miners. You earn by being consistent, not lucky.
        </p>
      </section>

      {/* Stats bar */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Blocks Found', value: stats.totalBlocks.toString() },
          { label: 'Active Miners (7d)', value: stats.activeMiners7d.toString() },
          { label: 'Leaderboard Slots', value: `${leaderboard.length} / 21` },
          { label: 'Per Slot If Found Now', value: leaderboard[0] ? formatBTC(leaderboard[0].estimatedPayoutSats) : '—' },
        ].map(s => (
          <div key={s.label} className="bg-white/5 rounded-lg p-4 border border-white/10">
            <div className="text-2xl font-bold">{s.value}</div>
            <div className="text-xs text-white/40 mt-1">{s.label}</div>
          </div>
        ))}
      </section>

      {/* Leaderboard */}
      <section>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          Current Leaderboard
          <span className="text-xs font-normal text-white/30 ml-1">
            7-day rolling · refreshes every 30s
          </span>
        </h2>

        {leaderboard.length === 0 ? (
          <div className="rounded-lg border border-white/10 p-12 text-center text-white/30">
            No miners on the leaderboard yet.{' '}
            <span className="block mt-2 text-sm">
              Connect to stratum+tcp://bitcoin.unlucky21.com:3333
            </span>
          </div>
        ) : (
          <div className="rounded-lg border border-white/10 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-white/5">
                  <th className="text-left px-4 py-3 text-white/40 font-medium w-12">Rank</th>
                  <th className="text-left px-4 py-3 text-white/40 font-medium">Address</th>
                  <th className="text-right px-4 py-3 text-white/40 font-medium hidden md:table-cell">Best Share</th>
                  <th className="text-right px-4 py-3 text-white/40 font-medium">Est. Payout</th>
                  <th className="text-right px-4 py-3 text-white/40 font-medium hidden md:table-cell">Last Seen</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((entry, i) => (
                  <tr
                    key={entry.btcAddress}
                    className="border-b border-white/5 hover:bg-white/5 transition-colors"
                  >
                    <td className="px-4 py-3 tabular-nums">
                      <span className={i < 3 ? 'text-yellow-400 font-bold' : 'text-white/40'}>
                        #{entry.rank}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <a
                        href={`/miner/${entry.btcAddress}`}
                        className="font-mono text-xs hover:text-yellow-400 transition-colors"
                      >
                        {truncate(entry.btcAddress)}
                      </a>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-white/50 hidden md:table-cell">
                      {BigInt(entry.bestShare).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-yellow-400/90 font-medium">
                      {formatBTC(entry.estimatedPayoutSats)}
                    </td>
                    <td className="px-4 py-3 text-right text-white/30 hidden md:table-cell">
                      {timeAgo(entry.lastSeen)}
                    </td>
                  </tr>
                ))}

                {/* Empty slots */}
                {Array.from({ length: Math.max(0, 21 - leaderboard.length) }).map((_, i) => (
                  <tr key={`empty-${i}`} className="border-b border-white/5">
                    <td className="px-4 py-3">
                      <span className="text-white/20">#{leaderboard.length + i + 1}</span>
                    </td>
                    <td className="px-4 py-3 text-white/20 text-xs font-mono italic" colSpan={4}>
                      open slot — connect your miner
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* How to connect */}
      <section className="rounded-lg border border-white/10 p-6 space-y-4">
        <h2 className="text-lg font-semibold">How to Connect</h2>
        <div className="grid md:grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-white/40 mb-1">Stratum URL</div>
            <code className="font-mono bg-white/5 px-2 py-1 rounded text-yellow-400">
              stratum+tcp://bitcoin.unlucky21.com:3333
            </code>
          </div>
          <div>
            <div className="text-white/40 mb-1">Username</div>
            <code className="font-mono bg-white/5 px-2 py-1 rounded">
              your_bitcoin_address
            </code>
          </div>
          <div>
            <div className="text-white/40 mb-1">Password</div>
            <code className="font-mono bg-white/5 px-2 py-1 rounded">
              x  (anything)
            </code>
          </div>
        </div>
        <div className="text-white/40 text-sm pt-2 border-t border-white/10">
          <strong className="text-white/70">Reward model:</strong>{' '}
          Block finder 2.1% · Top-21 share 95.8% equally split · Pool fee 2.1%.
          If you find the block <em>and</em> are in the top 21, you collect both slots.
        </div>
      </section>

    </div>
  )
}
