export default function MinerSearchPage() {
  return (
    <div className="max-w-xl space-y-8">
      <div className="max-w-4xl">
        <img src="/banner2.png" alt="Unlucky21 — Don't Find The Block. Make The List." className="w-full h-auto rounded-xl" />
      </div>
      <div>
        <h1 className="text-3xl font-black">My Stats</h1>
        <p className="text-white/40 text-sm mt-2">
          Look up any Bitcoin address on the leaderboard.
        </p>
      </div>

      <div className="space-y-3">
        <input
          id="addr-input"
          type="text"
          placeholder="bc1q... or 1..."
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-mono text-white placeholder:text-white/20 focus:outline-none focus:border-yellow-500/50"
        />
        <button
          id="addr-submit"
          className="w-full bg-yellow-500 hover:bg-yellow-400 text-black font-black px-6 py-3 rounded-xl text-sm transition-colors"
        >
          Look Up
        </button>
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
