import { getLeaderboard } from '@/lib/db'
import { formatBTC, truncate, timeAgo } from '@/lib/format'

export const dynamic = 'force-dynamic'

export default async function LeaderboardPage() {
  const leaderboard = await getLeaderboard(100)
  const top21 = leaderboard.filter(e => e.rank <= 21)
  const below = leaderboard.filter(e => e.rank > 21)

  return (
    <div className="space-y-6">
      <div className="max-w-4xl">
        <img src="/banner2.png" alt="Unlucky21 — Don't Find The Block. Make The List." className="w-full h-auto rounded-xl" />
      </div>
      <div>
        <h1 className="text-3xl font-black">Leaderboard</h1>
        <p className="text-white/40 text-sm mt-1">
          Top 100 by 7-day best share. Rows 1–21 receive a payout when the pool finds a block.
        </p>
      </div>

      <div className="rounded-xl bg-yellow-500/10 border border-yellow-500/30 px-5 py-3 text-sm text-yellow-400">
        The leaderboard resets to zero the moment Unlucky21 finds a block. Every slot opens.
      </div>

      <div className="rounded-xl border border-white/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 bg-white/5 text-white/40 text-xs font-medium">
              <th className="text-left px-4 py-3 w-12">Rank</th>
              <th className="text-left px-4 py-3">Address</th>
              <th className="text-right px-4 py-3 hidden md:table-cell">Best Share</th>
              <th className="text-right px-4 py-3 hidden md:table-cell">Est. Hashrate</th>
              <th className="text-right px-4 py-3 hidden sm:table-cell">Last Active</th>
              <th className="text-right px-4 py-3">Est. Payout</th>
            </tr>
          </thead>
          <tbody>
            {top21.map((entry) => {
              const isHomeMiner = entry.hashrate7dThs < 100
              return (
                <tr
                  key={entry.btcAddress}
                  className="border-b border-white/5 bg-yellow-500/5 hover:bg-yellow-500/10 transition-colors"
                >
                  <td className="px-4 py-3 tabular-nums border-l-2 border-l-yellow-500">
                    <span className="text-yellow-400 font-bold">#{entry.rank}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <a
                        href={`/miner/${entry.btcAddress}`}
                        className="font-mono text-xs hover:text-yellow-400 transition-colors"
                      >
                        {truncate(entry.btcAddress)}
                      </a>
                      {isHomeMiner && (
                        <span className="text-xs bg-yellow-500/10 text-yellow-500 border border-yellow-500/30 rounded px-1.5 py-0.5 font-bold hidden sm:inline">
                          HOME
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-white/40 text-xs hidden md:table-cell">
                    {BigInt(entry.bestShare).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-white/40 text-xs hidden md:table-cell">
                    {entry.hashrate7dThs < 0.001
                      ? '< 0.001 TH/s'
                      : `${entry.hashrate7dThs.toFixed(3)} TH/s`}
                  </td>
                  <td className="px-4 py-3 text-right text-white/30 text-xs hidden sm:table-cell">
                    {timeAgo(entry.lastSeen)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium text-xs">
                    <span className="text-yellow-400">{formatBTC(entry.estimatedPayoutSats)}</span>
                  </td>
                </tr>
              )
            })}

            {Array.from({ length: Math.max(0, 21 - top21.length) }).map((_, i) => (
              <tr
                key={`empty-${i}`}
                className="border-b border-white/5 bg-yellow-500/5"
              >
                <td className="px-4 py-3 border-l-2 border-l-yellow-500/30">
                  <span className="text-yellow-500/30">#{top21.length + i + 1}</span>
                </td>
                <td className="px-4 py-3 text-white/20 text-xs font-mono italic" colSpan={5}>
                  open slot — connect your miner
                </td>
              </tr>
            ))}

            <tr className="border-y border-red-500/30 bg-red-500/5">
              <td colSpan={6} className="px-4 py-2.5 text-center text-xs font-bold text-red-400 tracking-widest">
                — UNLUCKY 21 CUTOFF — ADDRESSES BELOW EARN NO PAYOUT THIS ROUND —
              </td>
            </tr>

            {below.map((entry) => {
              const isHomeMiner = entry.hashrate7dThs < 100
              return (
                <tr
                  key={entry.btcAddress}
                  className="border-b border-white/5 hover:bg-white/5 transition-colors"
                >
                  <td className="px-4 py-3 tabular-nums">
                    <span className="text-white/30">#{entry.rank}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <a
                        href={`/miner/${entry.btcAddress}`}
                        className="font-mono text-xs hover:text-yellow-400 transition-colors"
                      >
                        {truncate(entry.btcAddress)}
                      </a>
                      {isHomeMiner && (
                        <span className="text-xs bg-yellow-500/10 text-yellow-500 border border-yellow-500/30 rounded px-1.5 py-0.5 font-bold hidden sm:inline">
                          HOME
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-white/40 text-xs hidden md:table-cell">
                    {BigInt(entry.bestShare).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-white/40 text-xs hidden md:table-cell">
                    {entry.hashrate7dThs < 0.001
                      ? '< 0.001 TH/s'
                      : `${entry.hashrate7dThs.toFixed(3)} TH/s`}
                  </td>
                  <td className="px-4 py-3 text-right text-white/30 text-xs hidden sm:table-cell">
                    {timeAgo(entry.lastSeen)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium text-xs">
                    <span className="text-white/20">—</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-white/30 text-center">
        Rolling 7-day window — shares older than 7 days age out. Keep mining to hold your rank.
        &nbsp;HOME badge = estimated 7-day hashrate under 100 TH/s.
      </p>
    </div>
  )
}
