const RISKS = [
  {
    id: '01',
    title: 'Software Bugs',
    short: 'The pool software could prevent block finding, fail to submit a found block, or propagate it incorrectly.',
    detail: 'We have found over 900 test blocks on signet to verify the end-to-end flow. The pool is live on mainnet. But bugs can surface in production that tests never catch.',
  },
  {
    id: '02',
    title: 'Orphaned Blocks',
    short: 'Any block can be orphaned by the network before it reaches 2–3 confirmations.',
    detail: 'This is a natural part of Bitcoin. If our found block gets orphaned, no one gets paid. It can happen to any pool.',
  },
  {
    id: '03',
    title: 'Stale Shares',
    short: 'A share that arrives after the round closes cannot be counted — even if it would have solved the block.',
    detail: 'If a stale share carried enough difficulty to find a block, it is still rejected. Network latency and slow connections are risks you carry as a miner.',
  },
  {
    id: '04',
    title: 'Lost Addresses',
    short: 'Your Bitcoin address is your only identity and your only payout key. We have no account system.',
    detail: 'Payouts can arrive weeks, months, or years after you mined. If you lose access to your address, those funds are unrecoverable. We never touch your reward.',
  },
  {
    id: '05',
    title: 'Dropped from the 21',
    short: 'A better share from another miner can push you off the leaderboard at any second — including the moment before a block is found.',
    detail: 'If you are #22 when the block lands, you receive nothing. Monitor your rank. Mine again if you slip.',
  },
  {
    id: '06',
    title: 'Too Late to the List',
    short: 'A best share submitted in the final seconds before a block is found may not be included in the block template.',
    detail: 'If your address appears on the leaderboard for less than roughly one minute when a block is found, it may not have propagated to the miner\'s device in time. Addresses held for longer are not affected.',
  },
  {
    id: '07',
    title: 'Operator Trust',
    short: 'Unlucky21 has no fabricated shares and no manipulation. But the only evidence is the operator\'s word.',
    detail: 'The leaderboard is public. The pool software is open source. We cannot prove a negative — every address you see on the list competed genuinely.',
  },
  {
    id: '08',
    title: 'Legal & Regulatory',
    short: 'Any court order or regulatory action can shut this service down permanently without notice.',
    detail: 'If that happens, outstanding best shares are void with no recourse. Mining pools operate in a legal grey zone in some jurisdictions. Know the rules where you live.',
  },
]

export default function DisclaimerPage() {
  return (
    <div className="max-w-3xl space-y-10">
      <div className="max-w-4xl">
        <img src="/banner2.png" alt="Unlucky21 — Don't Find The Block. Make The List." className="w-full h-auto rounded-xl" />
      </div>

      <div>
        <h1 className="text-3xl font-black">Transparency &amp; Disclaimer</h1>
      </div>

      {/* TL;DR box */}
      <div className="rounded-xl bg-yellow-500/10 border border-yellow-500/30 p-6 space-y-2">
        <p className="text-xs font-bold uppercase tracking-widest text-yellow-400">TL;DR</p>
        <p className="text-sm text-yellow-400/80 leading-relaxed">
          Unlucky21 is experimental. Run by one person. No payouts are guaranteed. Eight things can go wrong
          — and any one of them can mean you get nothing. Mine only what you can afford to lose.
        </p>
        <p className="text-xs text-yellow-400/50 pt-1">
          This website, its software, and the individual behind it make no promises — in any context, at any level.
        </p>
      </div>

      {/* Risk list */}
      <div>
        <h2 className="text-xs font-bold uppercase tracking-widest text-white/40 mb-5">Eight Ways You Might Not Get Paid</h2>
        <div className="space-y-0 divide-y divide-white/10 border border-white/10 rounded-xl overflow-hidden">
          {RISKS.map(risk => (
            <div key={risk.id} className="p-5 grid md:grid-cols-[2.5rem_1fr_1.5fr] gap-x-4 gap-y-1">
              <div className="text-xs font-black text-white/20 pt-0.5 hidden md:block">{risk.id}</div>
              <div>
                <h3 className="font-black text-sm text-white">{risk.title}</h3>
                <p className="text-xs text-white/50 leading-relaxed mt-1">{risk.short}</p>
              </div>
              <p className="text-xs text-white/30 leading-relaxed md:pt-0.5">{risk.detail}</p>
            </div>
          ))}
        </div>
      </div>

      {/* What we guarantee */}
      <div className="rounded-xl border border-white/10 p-6 space-y-3">
        <h2 className="font-black text-base">What We Actually Guarantee</h2>
        <p className="text-white/60 text-sm leading-relaxed">
          Nothing, legally. But here is what we do commit to in practice: open-source pool software,
          a public leaderboard, direct coinbase payouts with no intermediary, and honest communication
          when things break. That is all.
        </p>
        <p className="text-white/40 text-sm leading-relaxed">
          If you want a pool with a longer track record, use one of these instead:
        </p>
        <ul className="space-y-1 text-sm">
          {[
            { label: 'ckpool',       href: 'https://solo.ckpool.org' },
            { label: 'public-pool',  href: 'https://web.public-pool.io' },
            { label: 'atlaspool.io', href: 'https://atlaspool.io' },
          ].map(p => (
            <li key={p.label}>
              <a href={p.href} target="_blank" rel="noopener noreferrer" className="text-yellow-400 hover:underline">
                {p.label}
              </a>
            </li>
          ))}
        </ul>
      </div>

      {/* Legal boilerplate */}
      <div className="rounded-xl bg-white/5 border border-white/10 p-6 text-xs text-white/40 leading-relaxed">
        <strong className="text-white/60">Legal Disclaimer:</strong> Participation in Bitcoin mining,
        including through Unlucky21, involves risks such as market volatility, hardware failure, and
        changes in network difficulty. Unlucky21 has not yet found a mainnet block; there is no assurance
        of future block discoveries or payouts. Unlucky21 shall not be held responsible for any losses,
        missed payouts, technical failures, or interruptions of service of any kind.
      </div>
    </div>
  )
}
