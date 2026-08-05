import { getSoloBlocks } from '@/lib/db'
import { formatBTC, truncate, timeAgo } from '@/lib/format'

export const dynamic = 'force-dynamic'

function FieldGrid({ fields }: { fields: { label: string; value: string }[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
      {fields.map(f => (
        <div key={f.label} className="bg-white/5 rounded-lg p-3">
          <div className="text-white/40 mb-0.5">{f.label}</div>
          <code className="text-yellow-400 font-mono break-all">{f.value}</code>
        </div>
      ))}
    </div>
  )
}

function HardwareSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 p-6 space-y-4">
      <h2 className="text-lg font-black">{title}</h2>
      <div className="space-y-3 text-sm">{children}</div>
    </div>
  )
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="bg-black border border-white/10 rounded-lg p-4 text-xs font-mono text-yellow-400 overflow-x-auto whitespace-pre">
      {children}
    </pre>
  )
}

function StatusBadge({ confirmed, isOrphaned }: { confirmed: boolean; isOrphaned: boolean }) {
  if (isOrphaned) return <span className="text-xs bg-red-500/20 text-red-400 border border-red-500/30 rounded px-2 py-0.5 font-bold">ORPHANED</span>
  if (confirmed) return <span className="text-xs bg-green-500/20 text-green-400 border border-green-500/30 rounded px-2 py-0.5 font-bold">CONFIRMED</span>
  return <span className="text-xs bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 rounded px-2 py-0.5 font-bold">PENDING</span>
}

export default async function SoloPage() {
  const soloBlocks = await getSoloBlocks(20)

  return (
    <div className="space-y-10 max-w-3xl">

      {/* ── Hero ── */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <h1 className="text-3xl font-black">BTC Solo Mining</h1>
          <span className="text-xs bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 rounded px-2 py-0.5 font-bold uppercase tracking-widest">Live</span>
        </div>
        <p className="text-white/60 text-sm leading-relaxed">
          A separate, dedicated pool for solo mining BTC — no streaks, no sharing, no top 21.
          Point your miner here, and if you find the block, the reward is yours.
        </p>
      </div>

      {/* ── Explainer ── */}
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6 space-y-4 text-sm text-white/60 leading-relaxed">
        <p>
          This is not the streak pool.{' '}
          <a href="/join" className="text-yellow-400 hover:underline">Unlucky Pool</a>{' '}
          (the one with the leaderboard) splits every block among the top 21.
          BTC Solo Mining doesn&apos;t split anything — every share, every block, belongs to
          the address that submitted it. Same coinbase-direct, no-custody design, just solo
          instead of shared.
        </p>
        <div className="grid grid-cols-3 gap-3 pt-1">
          {[
            { label: 'Your cut', value: '99%' },
            { label: 'Pool fee', value: '1%' },
            { label: 'Custody', value: 'None' },
          ].map(s => (
            <div key={s.label} className="bg-white/5 rounded-lg p-3 text-center">
              <div className="text-xl font-black text-yellow-400">{s.value}</div>
              <div className="text-xs text-white/40 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
        <p className="text-xs text-white/30 border-t border-white/10 pt-4">
          When your miner finds a block, 99% of the block reward goes directly to your address
          in the coinbase transaction. The 1% pool fee goes to Unlucky21. No withdrawal required —
          the coinbase pays you directly at block maturity (~100 confirmations).
        </p>
      </div>

      {/* ── Connection ── */}
      <div className="space-y-4">
        <h2 className="text-lg font-black">Connect</h2>
        <FieldGrid fields={[
          { label: 'Stratum URL', value: 'stratum+tcp://bitcoin.unlucky21.com:5555' },
          { label: 'Username',    value: 'your_btc_address.workername' },
          { label: 'Password',    value: 'x  (anything)' },
        ]} />
        <p className="text-xs text-white/30">
          Use your Bitcoin mainnet address as the username. Worker name is optional but helps you
          identify your rig: <code className="text-yellow-400/70">bc1qyouraddress.rig1</code>
        </p>
      </div>

      <HardwareSection title="Bitaxe">
        <ol className="text-white/60 space-y-1.5 list-decimal list-inside">
          <li>Open your Bitaxe web UI and go to <strong className="text-white">Settings</strong></li>
          <li>Fill in the pool fields:</li>
        </ol>
        <FieldGrid fields={[
          { label: 'Hostname', value: 'bitcoin.unlucky21.com' },
          { label: 'Port',     value: '5555' },
          { label: 'Username', value: 'your_btc_address' },
          { label: 'Password', value: 'x' },
        ]} />
        <p className="text-white/50">3. Click <strong className="text-white">Save</strong> — Bitaxe reconnects automatically.</p>
      </HardwareSection>

      <HardwareSection title="cpuminer (CPU / testing)">
        <p className="text-white/60">Run this command in your terminal:</p>
        <CodeBlock>{`cpuminer -a sha256d \\\n  -o stratum+tcp://bitcoin.unlucky21.com:5555 \\\n  -u YOUR_BTC_ADDRESS \\\n  -p x`}</CodeBlock>
      </HardwareSection>

      <HardwareSection title="ASIC / custom firmware">
        <p className="text-white/60">Any SHA-256 stratum miner works. Set the pool details to:</p>
        <CodeBlock>{`URL:      stratum+tcp://bitcoin.unlucky21.com:5555\nUsername: your_btc_address.workername\nPassword: x`}</CodeBlock>
        <p className="text-xs text-white/30">
          Vardiff is active — difficulty adjusts automatically to your hashrate.
        </p>
      </HardwareSection>

      {/* ── Blocks found ── */}
      <div className="space-y-4">
        <h2 className="text-lg font-black">Solo Blocks Found</h2>

        {soloBlocks.length === 0 ? (
          <div className="rounded-xl border border-white/10 p-8 text-center space-y-2">
            <p className="text-white/40 text-sm">No blocks found yet.</p>
            <p className="text-white/20 text-xs">
              Every valid block submitted on port 5555 will appear here with the finder&apos;s address and payout.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/10 text-white/40 text-left">
                  <th className="px-4 py-3 font-medium">Height</th>
                  <th className="px-4 py-3 font-medium">Finder</th>
                  <th className="px-4 py-3 font-medium">Payout</th>
                  <th className="px-4 py-3 font-medium">Found</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {soloBlocks.map(b => (
                  <tr key={b.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3 font-mono text-yellow-400 font-bold">{b.height.toLocaleString()}</td>
                    <td className="px-4 py-3 font-mono text-white/60">
                      <a
                        href={`https://mempool.space/address/${b.finderAddress}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-white transition-colors"
                      >
                        {truncate(b.finderAddress, 16)}
                      </a>
                    </td>
                    <td className="px-4 py-3 text-white/80 font-mono tabular-nums">{formatBTC(b.payoutSats)}</td>
                    <td className="px-4 py-3 text-white/40">{timeAgo(b.foundAt)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge confirmed={b.confirmed} isOrphaned={b.isOrphaned} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── vs Shared pool ── */}
      <div className="rounded-xl border border-white/10 p-6 space-y-4">
        <h2 className="text-base font-black text-white/60">Solo vs. Unlucky Pool</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-white/60">
            <thead>
              <tr className="border-b border-white/10 text-white/30">
                <th className="text-left pb-2 pr-4"></th>
                <th className="text-left pb-2 pr-4">BTC Solo (port 5555)</th>
                <th className="text-left pb-2">Unlucky Pool (port 3333)</th>
              </tr>
            </thead>
            <tbody className="space-y-1 divide-y divide-white/5">
              {[
                ['If you find the block', '99% to you', '2.1% finder + 95.8% split 21 ways'],
                ['If someone else finds', 'Nothing', 'Up to 1/21 share if ranked'],
                ['Pool fee', '1%', '2.1%'],
                ['Leaderboard', 'No', 'Yes'],
                ['Strategy', 'Pure solo luck', 'Hashrate → rank → share'],
              ].map(([label, solo, shared]) => (
                <tr key={label}>
                  <td className="py-2 pr-4 text-white/30">{label}</td>
                  <td className="py-2 pr-4 text-yellow-400">{solo}</td>
                  <td className="py-2 text-white/50">{shared}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  )
}
