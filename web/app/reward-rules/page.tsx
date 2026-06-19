export const dynamic = 'force-dynamic'

function RuleSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 pb-8 border-b border-white/10 last:border-0">
      <h2 className="text-xl font-black">{title}</h2>
      <div className="text-white/60 text-sm leading-relaxed space-y-2">{children}</div>
    </section>
  )
}

export default function RewardRulesPage() {
  return (
    <div className="max-w-3xl space-y-8">
      <div className="max-w-4xl">
        <img src="/banner2.png" alt="Unlucky21 — Don't Find The Block. Make The List." className="w-full h-auto rounded-xl" />
      </div>
      <div>
        <h1 className="text-3xl font-black">Reward Rules</h1>
        <p className="text-white/40 text-sm mt-2">How payouts are calculated and distributed.</p>
      </div>

      <div className="rounded-xl overflow-hidden border border-white/10">
        <div className="flex h-10">
          <div className="bg-yellow-500" style={{ width: '2.1%' }} title="Finder 2.1%" />
          <div className="bg-yellow-800" style={{ width: '2.1%' }} title="Pool Fee 2.1%" />
          <div className="bg-yellow-500/20 text-yellow-400 flex items-center justify-center flex-1 text-xs font-bold">
            95.8% → Top 21 Equal Split
          </div>
        </div>
        <div className="flex gap-6 text-xs text-white/40 px-4 py-2 bg-white/5">
          <span><span className="text-yellow-400 font-bold">2.1%</span> Block Finder</span>
          <span><span className="text-yellow-700 font-bold">2.1%</span> Pool Fee</span>
          <span><span className="text-yellow-400 font-bold">95.8%</span> Top 21 equal share</span>
        </div>
      </div>

      <div className="space-y-8">
        <RuleSection title="The Model">
          <p>When the pool finds a block, the reward (subsidy + fees) splits three ways:</p>
          <ul className="list-disc list-inside space-y-1">
            <li><strong className="text-white">Block Finder — 2.1%:</strong> The miner whose share solved the block gets a bonus.</li>
            <li><strong className="text-white">Pool Fee — 2.1%:</strong> Covers infrastructure and development.</li>
            <li><strong className="text-white">Top 21 Split — 95.8%:</strong> Divided equally among all Top 21 addresses at the moment the block is found.</li>
          </ul>
          <p>If the finder is also in the Top 21, they collect both — the bonus and their equal share.</p>
        </RuleSection>

        <RuleSection title="Your Single Best Shot">
          <p>
            Your position on the leaderboard is decided by exactly one thing: the highest-difficulty share your
            address has ever submitted in the current round. Not your total work. Not your average. Not how
            long you&apos;ve been connected. One share.
          </p>
          <p>
            Share difficulty is determined by the actual SHA256d hash of the work — not the pool-assigned target.
            Every submitted share produces a real hash. If that hash beats your previous best, it becomes your rank.
            Every other share you ever submitted is irrelevant to where you stand on the leaderboard.
          </p>
          <p>
            This means a small miner can outrank a large one. A single lucky share from a Bitaxe can hold
            a slot above a rented TH/s farm — at least until that farm gets lucky too.
            That&apos;s the whole game.
          </p>
        </RuleSection>

        <RuleSection title="The 7-Day Window">
          <p>
            Your best share expires after 7 days. If you stop mining entirely, your rank will eventually fall
            as your share ages out. The leaderboard is always a live snapshot of recent activity — not a
            permanent record.
          </p>
          <p>
            You don&apos;t need to mine constantly. Once you hold a slot, you can pause and check back. But
            if you&apos;ve been idle for a week and no block has dropped, your share will age out and you&apos;ll
            need to resubmit to reclaim your spot.
          </p>
        </RuleSection>

        <RuleSection title="Small Rigs, Real Shots">
          <p>
            A home miner running a single Bitaxe can hold a slot in the top 21 alongside rented TH/s farms —
            because the leaderboard rewards the best single share, not total output. More hashrate raises
            your statistical odds of hitting a high-difficulty outlier share, but it doesn&apos;t guarantee it.
          </p>
          <p>
            If you&apos;re running multiple machines under separate addresses, each address competes independently.
            Spreading across addresses can increase your total payout exposure if more than one of your
            slots makes the top 21.
          </p>
        </RuleSection>

        <RuleSection title="When The Block Drops">
          <p>
            The moment Unlucky21 finds a block, the leaderboard wipes completely. Every slot opens at once.
            The 21 addresses that held spots at that exact moment receive their equal cut of 95.8% — embedded
            directly in the coinbase transaction. There is no carry-over, no partial credit, no grace period.
          </p>
          <p>
            After the reset, the race starts over from zero. Your previous best share is gone.
            Submit a new one to get back in the running.
          </p>
        </RuleSection>

        <RuleSection title="The 100 TH/s Soft Cap">
          <p>We talked about a hashrate cap — but what can a mining pool actually do?</p>
          <p>
            Addresses with an estimated 7-day hashrate above 100 TH/s are soft-capped. The cap increases
            by 100 TH/s each time the pool finds a block. In practice, the pool can limit large miners through:
          </p>
          <ul className="list-disc list-inside space-y-1">
            <li><strong className="text-white">Score weighting:</strong> Shares from over-cap addresses receive a reduced difficulty multiplier for ranking.</li>
            <li><strong className="text-white">Share acceptance throttling:</strong> Ranking contribution is capped — shares still relay for connectivity, but don&apos;t stack rank indefinitely.</li>
            <li><strong className="text-white">Leaderboard labelling:</strong> Over-cap addresses are visible to everyone. Transparency is itself a form of accountability.</li>
          </ul>
          <p>
            The cap is "soft" because it&apos;s enforced at the pool level, not the protocol. A large miner can
            split hashrate across addresses to stay under — and that&apos;s fine. The goal is to keep the 21
            accessible to smaller rigs, not to exclude large ones.
          </p>
          <p>Addresses estimated below 100 TH/s earn a <strong className="text-yellow-400">HOME</strong> badge on the leaderboard.</p>
        </RuleSection>

        <RuleSection title="Your Address, Your Coins">
          <p>
            Payouts are embedded in the coinbase transaction of the found block — sent directly to your
            Bitcoin address. We never hold your Bitcoin. There is no withdrawal step, no account, no KYC.
            Your address is your key. Keep it.
          </p>
          <p>
            Because payouts can arrive weeks or months after you last mined, it&apos;s critical that you control
            the address you use as your username. Lost keys mean lost funds — and there is no recovery.
          </p>
        </RuleSection>

        <RuleSection title="Example Calculation">
          <p>At 3.125 BTC block subsidy, no fees, 21 full slots:</p>
          <ul className="list-none font-mono text-xs bg-white/5 rounded-lg p-4 space-y-1 text-white/60">
            <li>Total:           3.125 BTC = 312,500,000 sats</li>
            <li>Finder (2.1%):   6,562,500 sats  (~0.0656 BTC)</li>
            <li>Pool fee (2.1%): 6,562,500 sats</li>
            <li>Top 21 (95.8%): 299,375,000 sats</li>
            <li>Per slot:        14,255,952 sats  (~0.1426 BTC)</li>
          </ul>
          <p>Finder who is also in Top 21: 6,562,500 + 14,255,952 = 20,818,452 sats (~0.208 BTC).</p>
        </RuleSection>
      </div>
    </div>
  )
}
