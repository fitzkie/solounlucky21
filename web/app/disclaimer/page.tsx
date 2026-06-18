export const dynamic = 'force-dynamic'

function Risk({ emoji, title, children }: { emoji: string; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2 pb-6 border-b border-white/10 last:border-0">
      <h2 className="font-black text-base flex items-center gap-2">
        <span>{emoji}</span>{title}
      </h2>
      <div className="text-white/60 text-sm leading-relaxed space-y-2">{children}</div>
    </section>
  )
}

export default function DisclaimerPage() {
  return (
    <div className="max-w-3xl space-y-8">
      <div className="max-w-4xl">
        <img src="/banner2.png" alt="Unlucky21 — Don't Find The Block. Make The List." className="w-full h-auto rounded-xl" />
      </div>
      <div>
        <h1 className="text-3xl font-black">Transparency &amp; Disclaimer</h1>
        <div className="mt-4 rounded-xl bg-yellow-500/10 border border-yellow-500/30 px-5 py-4 text-sm text-yellow-400 leading-relaxed">
          Unlucky21 is in beta and extremely early in development. Think of it as a hobby, an
          experiment, and entertainment. Join only if you are comfortable knowing it can go down
          or go wrong at any minute, in any way, permanently or indefinitely.
          <br /><br />
          This website, its software, and the individual behind it do not promise anything — at
          any level, in any context.
        </div>
      </div>

      <p className="text-white/50 text-sm leading-relaxed">
        You will not get paid in the following situations — any of them are possible and all are
        inherent risks in running a new Bitcoin mining pool.
      </p>

      <div className="space-y-6">
        <Risk emoji="🛠️" title="Software Bugs and Misconfigurations">
          <p>It is entirely possible that bugs in the pool software could prevent block finding altogether, fail to deliver a found block to the node, or fail to propagate a block correctly.</p>
          <p>We have already tested the pool software and found over 900 test blocks on signet, confirming end-to-end block submission and payout logic. The pool is now live on mainnet.</p>
        </Risk>

        <Risk emoji="⛓️" title="Orphaned Blocks">
          <p>Orphaned blocks are a natural part of the Bitcoin network — any block can be orphaned before 2–3 confirmations. We could find a block and later lose it to a chain reorganisation. This can happen to any mining pool.</p>
        </Risk>

        <Risk emoji="🕰️" title="Stale Shares">
          <p>A stale share arrives after the round has closed and cannot be counted. In the most extreme case, if a stale share carried enough difficulty to find a block, it will still be rejected — no block submitted, nobody gets paid.</p>
        </Risk>

        <Risk emoji="📝" title="Mistyped or Forgotten Bitcoin Addresses">
          <p>Because our payment scheme is so different, you could win a significant amount of Bitcoin weeks, months, or years after submitting your best share. It is entirely your responsibility to control your address. We never touch your reward throughout the entire process.</p>
        </Risk>

        <Risk emoji="📉" title="Being Pushed Out of Best 21">
          <p>An address with a higher best share can drop you from Best 21 at any moment — including the very last seconds before a block is found. In that case you will not receive a reward, even if your address was visible in the list the entire time.</p>
        </Risk>

        <Risk emoji="⏱️" title="Joining Best 21 Too Late">
          <p>If your address submitted a best share just seconds before a block was found, it will not get paid — because it was not yet included in the block template distributed to the miner&apos;s device. If your address has been in the list for more than a minute when a block is found, this issue will not affect you.</p>
        </Risk>

        <Risk emoji="🎭" title="Pool Operator">
          <p>Unlucky21 has no fake entries, no fabricated shares, and no manipulation of any kind. Every address competed genuinely. But the only evidence of this is the operator&apos;s word.</p>
        </Risk>

        <Risk emoji="⚖️" title="Legal Risks">
          <p>Any court order or order from any governmental body can cause termination of this service indefinitely with no prior notice. In that case, your best share will be void with no recourse.</p>
        </Risk>
      </div>

      <div className="rounded-xl border border-white/10 p-6 space-y-3">
        <h2 className="font-black">Your Last Warning</h2>
        <p className="text-white/60 text-sm leading-relaxed">
          This is an experimental project run by a very new individual in pool management. To take
          no risk, use these battle-tested solo pools instead:
        </p>
        <ul className="space-y-1 text-sm">
          {[
            { label: 'ckpool',      href: 'https://solo.ckpool.org' },
            { label: 'public-pool', href: 'https://web.public-pool.io' },
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

      <div className="rounded-xl bg-white/5 border border-white/10 p-6 text-xs text-white/40 leading-relaxed">
        <strong className="text-white/60">Legal Disclaimer:</strong> Participation in Bitcoin
        mining, including through Unlucky21 (currently in beta), involves risks such as market
        volatility, hardware failure, and changes in network difficulty. Unlucky21 has not yet
        found a mainnet block; there is no assurance of future block discoveries or payouts.
        Unlucky21 shall not be held responsible for any losses, missed payouts, technical
        failures, or interruptions of service of any kind.
      </div>
    </div>
  )
}
