import { getExtendedPoolStats, getBlocks } from '@/lib/db'
import { getExternalStats } from '@/lib/external'
import { formatHashrate, formatDuration, blockProbability, formatBTC, truncate, timeAgo } from '@/lib/format'

export const revalidate = 30

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white/5 rounded-xl p-5 border border-white/10">
      <div className="text-2xl font-black text-yellow-400 tabular-nums">{value}</div>
      <div className="text-xs text-white/40 mt-1">{label}</div>
      {sub && <div className="text-xs text-white/25 mt-0.5">{sub}</div>}
    </div>
  )
}

export default async function StatsPage() {
  const [stats, ext, blocks] = await Promise.all([getExtendedPoolStats(), getExternalStats(), getBlocks(20)])

  const poolHs = stats.poolHashrateHs
  const netDiff = ext.networkDifficulty

  const expectedSeconds =
    poolHs > 0 && netDiff && netDiff > 0
      ? (netDiff * 4_294_967_296) / poolHs
      : null

  return (
    <div className="space-y-10">
      <div className="max-w-4xl">
        <img src="/banner2.png" alt="Unlucky21 — Don't Find The Block. Make The List." className="w-full h-auto rounded-xl" />
      </div>
      <div>
        <h1 className="text-3xl font-black">Pool Stats</h1>
        <p className="text-white/40 text-sm mt-1">
          Pool data is live. External data (BTC price, network) cached for 60 seconds.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-widest text-white/40">Pool</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <StatCard label="Blocks Found" value={stats.totalBlocks.toString()} />
          <StatCard label="Active Miners (7d)" value={stats.activeMiners7d.toString()} />
          <StatCard label="Accepted Shares (all-time)" value={stats.acceptedSharesTotal.toLocaleString()} />
          <StatCard
            label="All-Time Best Share"
            value={BigInt(stats.bestShareEver).toLocaleString()}
          />
          <StatCard
            label="Min Share to Enter Top 21"
            value={stats.minTop21Share ? BigInt(stats.minTop21Share).toLocaleString() : 'Any share'}
            sub={stats.minTop21Share ? 'current #21 threshold' : 'fewer than 21 miners — join now!'}
          />
          <StatCard
            label="Pool Hashrate (10 min)"
            value={poolHs > 0 ? formatHashrate(poolHs) : '—'}
            sub="estimated from recent shares"
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-widest text-white/40">Network (Mainnet)</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <StatCard
            label="BTC Price"
            value={ext.btcPriceUsd ? `$${ext.btcPriceUsd.toLocaleString()}` : '—'}
            sub="mainnet · mempool.space"
          />
          <StatCard
            label="Network Hashrate"
            value={ext.networkHashrateHs ? formatHashrate(ext.networkHashrateHs) : '—'}
            sub="mainnet · mempool.space"
          />
          <StatCard
            label="Network Difficulty"
            value={netDiff ? netDiff.toLocaleString() : '—'}
            sub="mainnet"
          />
        </div>
      </section>

      {expectedSeconds ? (
        <section className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-widest text-white/40">Block Probability</h2>
          <p className="text-xs text-white/30">
            Formula: expected time = (difficulty × 2³²) / pool_hashrate.
            Probability P(t) = 1 − e<sup>−t/expected</sup> (exponential distribution, Atlas Pool method).
            Assumes steady hashrate.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Expected Time to Block" value={formatDuration(expectedSeconds)} />
            <StatCard label="Chance in 24 hours" value={blockProbability(expectedSeconds, 86_400)} />
            <StatCard label="Chance in 7 days" value={blockProbability(expectedSeconds, 604_800)} />
            <StatCard label="Chance in 30 days" value={blockProbability(expectedSeconds, 2_592_000)} />
          </div>
        </section>
      ) : (
        <div className="rounded-xl border border-white/10 p-8 text-center text-white/30 text-sm">
          Block probability unavailable — pool hashrate is 0. Connect a miner to see estimates.
        </div>
      )}

      {/* ── Blocks Found ── */}
      <section className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-widest text-white/40">Blocks Found</h2>

        {blocks.length === 0 ? (
          <div className="rounded-xl border border-white/10 p-12 text-center space-y-3">
            <div className="text-5xl font-black text-white/10">0</div>
            <p className="text-white/30 text-sm">Unlucky21 has not found any blocks…. YET</p>
            <p className="text-white/20 text-xs">Be the first — connect your miner.</p>
            <a href="/join" className="inline-block mt-2 text-xs text-yellow-500 hover:text-yellow-400 transition-colors">
              How to join →
            </a>
          </div>
        ) : (
          <div className="rounded-xl border border-white/10 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-white/5 text-white/40 text-xs font-medium">
                  <th className="text-left px-4 py-3">Height</th>
                  <th className="text-left px-4 py-3 hidden sm:table-cell">Found</th>
                  <th className="text-left px-4 py-3">Finder</th>
                  <th className="text-right px-4 py-3 hidden md:table-cell">Fees</th>
                  <th className="text-right px-4 py-3">Slots</th>
                </tr>
              </thead>
              <tbody>
                {blocks.map(block => (
                  <tr key={block.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3 font-mono font-bold text-yellow-400">
                      {block.height.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-white/40 text-xs hidden sm:table-cell">
                      {timeAgo(block.foundAt)}
                    </td>
                    <td className="px-4 py-3">
                      <a
                        href={`/miner/${block.finderAddress}`}
                        className="font-mono text-xs hover:text-yellow-400 transition-colors"
                      >
                        {truncate(block.finderAddress)}
                      </a>
                    </td>
                    <td className="px-4 py-3 text-right text-white/40 text-xs hidden md:table-cell">
                      {formatBTC(block.blockFeesSats)}
                    </td>
                    <td className="px-4 py-3 text-right text-xs font-bold">
                      {block.slotsFilled}
                      <span className="text-white/30 font-normal"> / 21</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
