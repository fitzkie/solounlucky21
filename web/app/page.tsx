import { getPoolStats, getLeaderboard } from '@/lib/db'
import { formatBTC } from '@/lib/format'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const [stats, leaderboard] = await Promise.all([getPoolStats(), getLeaderboard(21)])

  const perSlotBtc = leaderboard[0] ? formatBTC(leaderboard[0].estimatedPayoutSats) : '—'
  const slotsLabel = `${leaderboard.length} / 21`

  return (
    <div className="space-y-20">

      {/* ── Hero ── */}
      <section className="text-center py-12 space-y-5">
        <div className="inline-flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/30 rounded-full px-4 py-1.5 text-xs text-yellow-500 font-bold tracking-widest uppercase">
          Beta · Signet Testnet
        </div>
        <h1 className="text-4xl md:text-6xl font-black tracking-tight leading-none">
          DON&apos;T FIND THE BLOCK.
          <br />
          <span className="text-yellow-400">MAKE THE LIST.</span>
        </h1>
        <p className="text-white/50 text-base md:text-lg max-w-xl mx-auto">
          The Bitcoin Pool Where Finding The Block Doesn&apos;t Matter™
        </p>
        <div className="flex justify-center gap-3 pt-2">
          <a
            href="https://t.me/unlucky21solopool"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-[#229ED9] hover:bg-[#1a8bc2] text-white font-bold px-5 py-2.5 rounded-xl text-sm transition-colors"
          >
            Join Telegram
          </a>
          <a
            href="https://x.com/unlucky21pool"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white font-bold px-5 py-2.5 rounded-xl text-sm transition-colors border border-white/10"
          >
            Follow on X
          </a>
        </div>
      </section>

      {/* ── Pool Stats Snapshot ── */}
      <section className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xs font-bold uppercase tracking-widest text-white/40">Pool Stats</h2>
          <a href="/stats" className="text-xs text-yellow-500 hover:text-yellow-400 transition-colors">Full stats →</a>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Blocks Found',           value: stats.totalBlocks.toString() },
            { label: 'Active Miners (7d)',      value: stats.activeMiners7d.toString() },
            { label: 'Slots Filled',            value: slotsLabel },
            { label: 'Est. BTC/Slot if Found',  value: perSlotBtc },
          ].map(s => (
            <div key={s.label} className="bg-white/5 rounded-xl p-4 border border-white/10">
              <div className="text-2xl font-black text-yellow-400">{s.value}</div>
              <div className="text-xs text-white/40 mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── How Each Block Pays Out ── */}
      <section className="space-y-6">
        <h2 className="text-xs font-bold uppercase tracking-widest text-white/40">How Each Block Pays Out</h2>

        <div className="rounded-xl overflow-hidden border border-white/10">
          <div className="flex text-xs font-bold h-10">
            <div className="bg-yellow-500" style={{ width: '2.1%' }} title="Finder 2.1%" />
            <div className="bg-yellow-800" style={{ width: '2.1%' }} title="Pool Fee 2.1%" />
            <div className="bg-yellow-500/20 text-yellow-400 flex items-center justify-center flex-1 text-xs">
              95.8% → Top 21 Split Equally
            </div>
          </div>
          <div className="flex gap-6 text-xs text-white/40 px-4 py-2 bg-white/5">
            <span><span className="text-yellow-400 font-bold">2.1%</span> Finder</span>
            <span><span className="text-yellow-700 font-bold">2.1%</span> Pool Fee</span>
            <span><span className="text-yellow-400 font-bold">95.8%</span> Top 21 equal split</span>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4 text-sm">
          <div className="rounded-xl border border-white/10 p-5 space-y-2">
            <h3 className="font-bold text-white/50 text-xs uppercase tracking-widest">Traditional Solo Mining</h3>
            <ul className="text-white/50 space-y-1">
              <li>Find the block → win everything</li>
              <li>Everyone else → win nothing</li>
            </ul>
          </div>
          <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-5 space-y-2">
            <h3 className="font-bold text-yellow-400 text-xs uppercase tracking-widest">Unlucky21™</h3>
            <ul className="text-white/70 space-y-1">
              <li>Find the block → receive a small bonus (2.1%)</li>
              <li>Make the Top 21 → receive the biggest rewards</li>
            </ul>
          </div>
        </div>

        <p className="text-center text-sm text-white/40">
          Find the block. Get <span className="text-yellow-400 font-bold">2.1%</span>.
          &nbsp;&nbsp;Make the list. Get <span className="text-yellow-400 font-bold">paid</span>.
        </p>
      </section>

      {/* ── Quality Over Quantity ── */}
      <section className="rounded-xl border border-white/10 p-8 space-y-3">
        <h2 className="text-xl font-black">Quality Over Quantity</h2>
        <p className="text-white/60 leading-relaxed text-sm">
          Only your single best share this round determines your rank. Higher hashrate means a
          statistically better chance of producing a high-quality share — but you don&apos;t need to
          outwork everyone, just outperform on one share.
        </p>
      </section>

      {/* ── Mine When You Want ── */}
      <section className="rounded-xl border border-white/10 p-8 space-y-3">
        <h2 className="text-xl font-black">Mine When You Want</h2>
        <p className="text-white/60 leading-relaxed text-sm">
          Once you&apos;re in the Best 21 list, you&apos;re free to stop. You&apos;ll collect your reward if and
          when a block is found — no need to keep mining. Just check your rank from time to time.
          If you&apos;ve dropped below #21, fire up your miner again to reclaim your spot.
        </p>
      </section>

      {/* ── Connect Snippet ── */}
      <section className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xs font-bold uppercase tracking-widest text-white/40">Connect Your Miner</h2>
          <a href="/connect" className="text-xs text-yellow-500 hover:text-yellow-400 transition-colors">Full guide with hardware examples →</a>
        </div>
        <div className="rounded-xl border border-white/10 p-6 grid md:grid-cols-3 gap-4">
          {[
            { label: 'Stratum URL', value: 'stratum+tcp://bitcoin.unlucky21.com:3333' },
            { label: 'Username',    value: 'your_bitcoin_address' },
            { label: 'Password',    value: 'x  (anything)' },
          ].map(item => (
            <div key={item.label}>
              <div className="text-white/40 text-xs mb-1">{item.label}</div>
              <code className="bg-white/5 text-yellow-400 px-2 py-1.5 rounded text-xs font-mono block break-all">
                {item.value}
              </code>
            </div>
          ))}
        </div>
      </section>

      {/* ── Reward Rules Teaser ── */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xs font-bold uppercase tracking-widest text-white/40">Reward Rules</h2>
          <a href="/reward-rules" className="text-xs text-yellow-500 hover:text-yellow-400 transition-colors">Full rules →</a>
        </div>
        <p className="text-white/50 text-sm leading-relaxed">
          Your rank is based on your single highest-difficulty share submitted in the last 7 days.
          The leaderboard resets to zero the moment Unlucky21 finds a block — every slot opens
          and the race begins again from scratch.
        </p>
      </section>

      {/* ── Community ── */}
      <section className="text-center py-10 space-y-5 border-t border-white/10">
        <h2 className="text-xs font-bold uppercase tracking-widest text-white/40">Join the Community</h2>
        <div className="flex justify-center gap-4">
          <a
            href="https://t.me/unlucky21solopool"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-[#229ED9] hover:bg-[#1a8bc2] text-white font-bold px-6 py-3 rounded-xl text-sm transition-colors"
          >
            Join Telegram
          </a>
          <a
            href="https://x.com/unlucky21pool"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white font-bold px-6 py-3 rounded-xl text-sm transition-colors border border-white/10"
          >
            Follow on X
          </a>
        </div>
      </section>

    </div>
  )
}
