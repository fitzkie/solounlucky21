export const dynamic = 'force-dynamic'

const FAQS = [
  {
    q: 'How is my rank determined?',
    a: 'Your rank is based on your single highest-difficulty share submitted in the last 7 days. Only your best share counts — all others are ignored for ranking purposes.',
  },
  {
    q: 'What happens if I stop mining?',
    a: 'Your best share has a 7-day rolling expiry. If you stop mining, your share will eventually age out and your rank will drop. Check your rank periodically and fire up your miner if you need to reclaim your spot.',
  },
  {
    q: 'What happens when Unlucky21 finds a block?',
    a: 'The leaderboard resets to zero. Every slot opens simultaneously. The finder receives a 2.1% bonus. The Top 21 addresses at the moment the block was found each receive an equal share of 95.8% of the block reward. Then the race begins again.',
  },
  {
    q: 'How do I receive my payout?',
    a: "Payouts are delivered in the block's coinbase transaction, directly to your Bitcoin address. There is no withdrawal step and we never hold your funds. Your address is your key.",
  },
  {
    q: 'Can I use a rental service like NiceHash or Braiins?',
    a: 'Yes. Set the custom pool destination to stratum+tcp://bitcoin.unlucky21.com:3333 with your Bitcoin address as the username. See the Connect page for step-by-step instructions.',
  },
  {
    q: 'What is the minimum hashrate to compete?',
    a: 'There is no minimum. Any share gets you on the leaderboard. Higher hashrate gives a statistically better chance of a high-difficulty share that ranks well.',
  },
  {
    q: 'Is there a fee?',
    a: 'Yes — 2.1% of each block reward goes to the pool for infrastructure and development costs.',
  },
  {
    q: 'What is the 100 TH/s soft cap?',
    a: 'To give smaller miners a fair chance, addresses with an estimated 7-day hashrate above 100 TH/s are soft-capped. The cap increases by 100 TH/s each time the pool finds a block. The HOME badge on the leaderboard marks addresses estimated below 100 TH/s.',
  },
  {
    q: 'Is my Bitcoin address safe?',
    a: 'Your address is only used as a Stratum username. We never ask for your private key. Payouts go directly to your address in the coinbase transaction — we never hold any funds.',
  },
  {
    q: 'What is signet?',
    a: 'Signet is a Bitcoin test network with no real monetary value. We are currently running on signet to test the pool software before launching on mainnet. Use a signet address, not a mainnet address.',
  },
]

export default function FaqPage() {
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-black">FAQ</h1>
        <p className="text-white/40 text-sm mt-2">Frequently asked questions.</p>
      </div>
      <div className="space-y-4">
        {FAQS.map((item, i) => (
          <div key={i} className="rounded-xl border border-white/10 p-6 space-y-2">
            <h2 className="font-black text-base">{item.q}</h2>
            <p className="text-white/60 text-sm leading-relaxed">{item.a}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
