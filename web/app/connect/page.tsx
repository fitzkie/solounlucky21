export const dynamic = 'force-dynamic'

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="bg-black border border-white/10 rounded-lg p-4 text-xs font-mono text-yellow-400 overflow-x-auto whitespace-pre">
      {children}
    </pre>
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

function FieldGrid({ fields }: { fields: { label: string; value: string }[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 text-xs">
      {fields.map(f => (
        <div key={f.label} className="bg-white/5 rounded-lg p-3">
          <div className="text-white/40 mb-0.5">{f.label}</div>
          <code className="text-yellow-400 font-mono break-all">{f.value}</code>
        </div>
      ))}
    </div>
  )
}

export default function ConnectPage() {
  return (
    <div className="space-y-8 max-w-3xl">
      <div className="max-w-4xl">
        <img src="/banner2.png" alt="Unlucky21 — Don't Find The Block. Make The List." className="w-full h-auto rounded-xl" />
      </div>

      <div>
        <h1 className="text-3xl font-black">Connect Your Miner</h1>
        <p className="text-white/40 text-sm mt-2">
          Currently running on <strong className="text-yellow-400">Mainnet</strong>.
          Use your Bitcoin mainnet address as your username.
        </p>
      </div>

      <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-6 space-y-4">
        <h2 className="text-lg font-black">Pool Connection Details</h2>
        <div className="grid md:grid-cols-3 gap-4">
          {[
            { label: 'Stratum URL', value: 'stratum+tcp://bitcoin.unlucky21.com:3333' },
            { label: 'Username',    value: 'your_btc_address' },
            { label: 'Password',    value: 'x  (anything)' },
          ].map(item => (
            <div key={item.label}>
              <div className="text-white/40 text-xs mb-1">{item.label}</div>
              <code className="bg-black/40 text-yellow-400 px-2 py-1.5 rounded text-xs font-mono block break-all">
                {item.value}
              </code>
            </div>
          ))}
        </div>
        <p className="text-xs text-white/30 border-t border-white/10 pt-3">
          Worker name is optional: <code className="text-yellow-400/70">your_address.worker1</code>
        </p>
      </div>

      <HardwareSection title="Bitaxe">
        <ol className="text-white/60 space-y-1.5 list-decimal list-inside">
          <li>Open your Bitaxe web UI (usually <code className="text-yellow-400">http://bitaxe.local</code> or its IP address)</li>
          <li>Go to <strong className="text-white">Settings</strong></li>
          <li>Fill in the pool fields:</li>
        </ol>
        <FieldGrid fields={[
          { label: 'Hostname',  value: 'bitcoin.unlucky21.com' },
          { label: 'Port',      value: '3333' },
          { label: 'Username',  value: 'your_btc_address' },
          { label: 'Password',  value: 'x' },
        ]} />
        <p className="text-white/50">4. Click <strong className="text-white">Save</strong> — Bitaxe reconnects automatically.</p>
      </HardwareSection>

      <HardwareSection title="Avalon Nano">
        <ol className="text-white/60 space-y-1.5 list-decimal list-inside">
          <li>Connect the Avalon Nano via USB and open its control app or web UI</li>
          <li>Go to <strong className="text-white">Pool Settings</strong></li>
          <li>Set Pool 1:</li>
        </ol>
        <CodeBlock>{`URL:      stratum+tcp://bitcoin.unlucky21.com:3333\nWorker:   your_btc_address\nPassword: x`}</CodeBlock>
        <p className="text-white/50">4. Save and restart the device.</p>
      </HardwareSection>

      <HardwareSection title="cpuminer (CPU / testing)">
        <p className="text-white/60">Run this command in your terminal:</p>
        <CodeBlock>{`cpuminer -a sha256d \\\n  -o stratum+tcp://bitcoin.unlucky21.com:3333 \\\n  -u YOUR_BTC_ADDRESS \\\n  -p x`}</CodeBlock>
        <p className="text-white/30 text-xs">
          CPU mining produces very low-difficulty shares. Good for testing connectivity — not competitive for the leaderboard.
        </p>
      </HardwareSection>

      <HardwareSection title="Braiins Pool (Hash Rental)">
        <p className="text-white/60">Braiins allows you to rent hashrate and direct it to a custom pool.</p>
        <ol className="text-white/60 space-y-1.5 list-decimal list-inside">
          <li>Sign in at <a href="https://pool.braiins.com" className="text-yellow-400 hover:underline" target="_blank" rel="noopener noreferrer">pool.braiins.com</a></li>
          <li>Go to <strong className="text-white">Settings → Worker Configuration</strong></li>
          <li>Set custom pool endpoint:</li>
        </ol>
        <CodeBlock>{`stratum+tcp://bitcoin.unlucky21.com:3333`}</CodeBlock>
        <ol className="text-white/60 space-y-1.5 list-decimal list-inside" start={4}>
          <li>Set username to your Bitcoin mainnet address</li>
          <li>Save and start the rental</li>
        </ol>
      </HardwareSection>

      <HardwareSection title="NiceHash (Hash Rental)">
        <p className="text-white/60">NiceHash lets you buy SHA-256 hashrate and point it at a custom pool.</p>
        <ol className="text-white/60 space-y-1.5 list-decimal list-inside">
          <li>Log in at <a href="https://www.nicehash.com" className="text-yellow-400 hover:underline" target="_blank" rel="noopener noreferrer">nicehash.com</a></li>
          <li>Go to <strong className="text-white">Hash Power Marketplace → Buy</strong></li>
          <li>Select <strong className="text-white">SHA-256</strong> algorithm</li>
          <li>Choose <strong className="text-white">Custom Pool</strong> and enter:</li>
        </ol>
        <FieldGrid fields={[
          { label: 'Pool Host', value: 'bitcoin.unlucky21.com' },
          { label: 'Port',      value: '3333' },
          { label: 'Username',  value: 'your_btc_address' },
          { label: 'Password',  value: 'x' },
        ]} />
        <p className="text-white/50">5. Place the order. Hash arrives at the pool within minutes.</p>
      </HardwareSection>

      {/* ── Signet / Testnet section ── */}
      <div id="signet" className="rounded-xl border border-white/10 bg-white/5 p-6 space-y-4">
        <h2 className="text-lg font-black text-white/60">Want to test on Signet (Testnet)?</h2>
        <p className="text-white/40 text-sm">
          Signet is a Bitcoin test network with no real monetary value. If you want to experiment
          before committing real hashrate, connect to the signet endpoint below using a signet address.
        </p>
        <div className="grid md:grid-cols-3 gap-4">
          {[
            { label: 'Stratum URL', value: 'stratum+tcp://108.61.202.106:3333' },
            { label: 'Username',    value: 'your_signet_address' },
            { label: 'Password',    value: 'x  (anything)' },
          ].map(item => (
            <div key={item.label}>
              <div className="text-white/40 text-xs mb-1">{item.label}</div>
              <code className="bg-black/40 text-yellow-400/60 px-2 py-1.5 rounded text-xs font-mono block break-all">
                {item.value}
              </code>
            </div>
          ))}
        </div>
        <p className="text-xs text-white/30 border-t border-white/10 pt-3">
          This is the dedicated signet test node — separate from mainnet. Signet shares do not appear on the mainnet leaderboard.
          Use a signet Bitcoin address (starts with <code className="text-yellow-400/60">tb1q</code>).
        </p>
        <p className="text-xs text-white/20">
          CPU miner example: <code className="text-yellow-400/40">cpuminer -a sha256d -o stratum+tcp://108.61.202.106:3333 -u YOUR_SIGNET_ADDRESS -p x</code>
        </p>
      </div>
    </div>
  )
}
