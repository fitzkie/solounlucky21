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

        <RuleSection title="How Ranking Works">
          <p>Your rank is your single highest-difficulty share submitted in the last 7 days. Only your best share counts — all others are ignored for ranking purposes.</p>
          <p>Higher hashrate gives a statistically better chance of a high-difficulty share, but one great share from a small miner can outrank consistent output from a large one.</p>
        </RuleSection>

        <RuleSection title="The 7-Day Rolling Window">
          <p>Shares older than 7 days age out of the leaderboard. If you stop mining, your share expires and your rank drops. Mine occasionally to maintain your position.</p>
        </RuleSection>

        <RuleSection title="Leaderboard Reset">
          <p>The moment Unlucky21 finds a block, the leaderboard resets to zero. Every slot opens simultaneously. There is no carry-over between rounds.</p>
        </RuleSection>

        <RuleSection title="Soft Hashrate Cap">
          <p>Addresses with an estimated 7-day hashrate above 100 TH/s are soft-capped. The cap increases by 100 TH/s each time the pool finds a block. Addresses below 100 TH/s receive a <strong className="text-yellow-400">HOME</strong> badge on the leaderboard — no effect on payouts, just a label.</p>
        </RuleSection>

        <RuleSection title="Payout Delivery">
          <p>Payouts are in the coinbase transaction of the found block, sent directly to your address. We never hold your Bitcoin. There is no withdrawal step and no account.</p>
        </RuleSection>

        <RuleSection title="Example Calculation">
          <p>At 3.125 BTC block subsidy, no fees, 21 full slots:</p>
          <ul className="list-none font-mono text-xs bg-white/5 rounded-lg p-4 space-y-1 text-white/60">
            <li>Total:          3.125 BTC = 312,500,000 sats</li>
            <li>Finder (2.1%):  6,562,500 sats  (~0.0656 BTC)</li>
            <li>Pool fee (2.1%):6,562,500 sats</li>
            <li>Top 21 (95.8%):299,375,000 sats</li>
            <li>Per slot:       14,255,952 sats  (~0.1426 BTC)</li>
          </ul>
          <p>Finder who is also in Top 21: 6,562,500 + 14,255,952 = 20,818,452 sats (~0.208 BTC).</p>
        </RuleSection>
      </div>
    </div>
  )
}
