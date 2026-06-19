export default function MinerSearchPage() {
  return (
    <div className="max-w-xl space-y-10">
      <div className="max-w-4xl">
        <img src="/banner2.png" alt="Unlucky21 — Don't Find The Block. Make The List." className="w-full h-auto rounded-xl" />
      </div>

      <div className="space-y-2">
        <h1 className="text-3xl font-black">Miner</h1>
        <p className="text-white/40 text-sm leading-relaxed">
          Enter any Bitcoin address to check its rank, best share, and estimated payout if a block drops now.
        </p>
      </div>

      <div className="space-y-3">
        <label htmlFor="addr-input" className="text-xs font-bold uppercase tracking-widest text-white/40 block">
          Bitcoin Address
        </label>
        <input
          id="addr-input"
          type="text"
          placeholder="bc1q… or 1…"
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 text-sm font-mono text-white placeholder:text-white/20 focus:outline-none focus:border-yellow-500/50 transition-colors"
        />
        <button
          id="addr-submit"
          className="w-full bg-yellow-500 hover:bg-yellow-400 text-black font-black px-6 py-3.5 rounded-xl text-sm transition-colors tracking-wide"
        >
          Check Rank →
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3 pt-2">
        {[
          { label: 'Current Rank', desc: 'Your position in the Top 21 right now' },
          { label: 'Best Share',   desc: 'Highest-difficulty share this round' },
          { label: 'Time Left',    desc: 'Days until your share expires' },
        ].map(item => (
          <div key={item.label} className="rounded-xl border border-white/10 p-4 space-y-1.5">
            <div className="text-xs font-bold text-yellow-400/70">{item.label}</div>
            <div className="text-xs text-white/30 leading-snug">{item.desc}</div>
          </div>
        ))}
      </div>

      <script dangerouslySetInnerHTML={{
        __html: `
          document.getElementById('addr-submit').addEventListener('click', function() {
            var addr = document.getElementById('addr-input').value.trim();
            if (addr) window.location.href = '/miner/' + encodeURIComponent(addr);
          });
          document.getElementById('addr-input').addEventListener('keydown', function(e) {
            if (e.key === 'Enter') document.getElementById('addr-submit').click();
          });
        `
      }} />
    </div>
  )
}
