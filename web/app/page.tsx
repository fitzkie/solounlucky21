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
      <section className="text-center py-12 space-y-6">
        <div className="max-w-4xl mx-auto">
          <img
            src="/banner.png"
            alt="Unlucky21 Solo Pool — The Bitcoin Pool Where Finding The Block Doesn't Matter"
            className="w-full h-auto"
          />
        </div>
        <h1 className="text-4xl md:text-6xl font-black tracking-tight leading-none">
          DON&apos;T FIND THE BLOCK.
          <br />
          <span className="text-yellow-400">MAKE THE LIST.</span>
        </h1>
        <p className="text-white/50 text-base max-w-xl mx-auto leading-relaxed">
          Only 21 spots. The miners with the highest-quality shares split 95.8% of every block reward — equally.
        </p>
        <div className="flex justify-center gap-3 pt-2">
          <a
            href="/connect"
            className="inline-flex items-center gap-2 bg-yellow-500 hover:bg-yellow-400 text-black font-bold px-6 py-2.5 rounded-xl text-sm transition-colors"
          >
            Start Mining
          </a>
          <a
            href="/leaderboard"
            className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white font-bold px-6 py-2.5 rounded-xl text-sm transition-colors border border-white/10"
          >
            View Leaderboard
          </a>
        </div>
      </section>

      {/* ── Live Numbers ── */}
      <section className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xs font-bold uppercase tracking-widest text-white/40">Live Numbers</h2>
          <a href="/stats" className="text-xs text-yellow-500 hover:text-yellow-400 transition-colors">Full stats →</a>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Blocks Found',       value: stats.totalBlocks.toString() },
            { label: 'Active Miners (7d)', value: stats.activeMiners7d.toString() },
            { label: 'Slots Filled',       value: slotsLabel },
            { label: 'Est. BTC / Slot',    value: perSlotBtc },
          ].map(s => (
            <div key={s.label} className="bg-white/5 rounded-xl p-4 border border-white/10">
              <div className="text-2xl font-black text-yellow-400">{s.value}</div>
              <div className="text-xs text-white/40 mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── How It Works ── */}
      <section className="space-y-6">
        <h2 className="text-xs font-bold uppercase tracking-widest text-white/40">How It Works</h2>
        <div className="grid md:grid-cols-3 gap-4">
          {[
            {
              step: '01',
              title: 'Point Your Miner',
              body: 'Set your stratum URL to bitcoin.unlucky21.com:3333. Use your Bitcoin address as the username. No registration, no account.',
            },
            {
              step: '02',
              title: 'Compete for a Spot',
              body: 'Your rank is your single best share this round — the highest-difficulty share you have submitted. Top 21 make the list.',
            },
            {
              step: '03',
              title: 'Collect When a Block Drops',
              body: 'Unlucky21 finds a block. The 21 addresses on the list each receive an equal cut of 95.8% of the reward. Automatically.',
            },
          ].map(item => (
            <div key={item.step} className="rounded-xl border border-white/10 p-6 space-y-3">
              <div className="text-3xl font-black text-yellow-400/30">{item.step}</div>
              <h3 className="font-black text-base">{item.title}</h3>
              <p className="text-white/50 text-sm leading-relaxed">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Where the reward goes ── */}
      <section className="space-y-6">
        <h2 className="text-xs font-bold uppercase tracking-widest text-white/40">Where The Reward Goes</h2>

        <div className="rounded-xl overflow-hidden border border-white/10">
          <div className="flex text-xs font-bold h-10">
            <div className="bg-yellow-500" style={{ width: '2.1%' }} title="Finder bonus 2.1%" />
            <div className="bg-yellow-800" style={{ width: '2.1%' }} title="Pool fee 2.1%" />
            <div className="bg-yellow-500/20 text-yellow-400 flex items-center justify-center flex-1 text-xs">
              95.8% → 21 Addresses, Equal Shares
            </div>
          </div>
          <div className="flex gap-6 text-xs text-white/40 px-4 py-2 bg-white/5">
            <span><span className="text-yellow-400 font-bold">2.1%</span> Finder bonus</span>
            <span><span className="text-yellow-700 font-bold">2.1%</span> Pool fee</span>
            <span><span className="text-yellow-400 font-bold">95.8%</span> Top 21 equal split</span>
          </div>
        </div>

        <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-6">
          <p className="text-sm text-white/70 leading-relaxed">
            <span className="text-yellow-400 font-bold">Finding the block earns a 2.1% bonus.</span>{' '}
            But the real reward — 95.8% — goes to all 21 addresses on the list, including the finder.
            You don&apos;t have to find anything. You just have to outperform 21 other miners on one share.
          </p>
        </div>
      </section>

      {/* ── Every block resets ── */}
      <section className="rounded-xl border border-white/10 p-8">
        <div className="flex items-start gap-4">
          <div className="text-3xl">🔄</div>
          <div className="space-y-2">
            <h2 className="text-xl font-black">Every Block Resets The Race</h2>
            <p className="text-white/60 leading-relaxed text-sm">
              The moment Unlucky21 finds a block, every slot opens up. The leaderboard wipes completely
              and the competition starts fresh. Your rank goes to zero. Get your best share in early —
              you never know when the next block drops.
            </p>
          </div>
        </div>
      </section>

      {/* ── Earn your spot then wait ── */}
      <section className="rounded-xl border border-white/10 p-8">
        <div className="flex items-start gap-4">
          <div className="text-3xl">⚡</div>
          <div className="space-y-2">
            <h2 className="text-xl font-black">Earn Your Spot, Then Wait</h2>
            <p className="text-white/60 leading-relaxed text-sm">
              Once you&apos;re in the top 21, you can stop mining. Your slot holds until someone submits
              a better share. Check your rank at{' '}
              <a href="/miner" className="text-yellow-400 hover:underline">My Stats</a> anytime.
              If you&apos;ve slipped below #21, fire back up and reclaim your spot.
            </p>
          </div>
        </div>
      </section>

      {/* ── Connect ── */}
      <section className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xs font-bold uppercase tracking-widest text-white/40">Connect Your Miner</h2>
          <a href="/connect" className="text-xs text-yellow-500 hover:text-yellow-400 transition-colors">Full guide with hardware examples →</a>
        </div>
        <div className="rounded-xl border border-white/10 p-6 grid md:grid-cols-3 gap-4">
          {[
            { label: 'Stratum URL', value: 'stratum+tcp://bitcoin.unlucky21.com:3333' },
            { label: 'Username',    value: 'your_btc_address' },
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

      {/* ── Why 21 ── */}
      <section className="rounded-xl border border-white/10 p-8 space-y-3">
        <h2 className="text-xl font-black">Why 21?</h2>
        <p className="text-white/60 leading-relaxed text-sm">
          Bitcoin has 21 million coins. Blackjack busts at 22. The best hand you can hold is 21 —
          and that&apos;s exactly how many miners get paid here. Fewer slots means a bigger split per
          person and a tighter, more competitive race. Every share counts more.
        </p>
      </section>

      {/* ── Community ── */}
      <section className="text-center py-10 space-y-5 border-t border-white/10">
        <h2 className="text-xs font-bold uppercase tracking-widest text-white/40">Join The Community</h2>
        <p className="text-white/40 text-sm">Discuss strategy, share best scores, and get notified when Unlucky21 finds a block.</p>
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
