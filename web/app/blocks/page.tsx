import { getBlocks } from '@/lib/db'
import { formatBTC, truncate, timeAgo } from '@/lib/format'

export const dynamic = 'force-dynamic'

export default async function BlocksPage() {
  const blocks = await getBlocks(50)

  return (
    <div className="space-y-6">
      <div className="max-w-4xl">
        <img src="/banner2.png" alt="Unlucky21 — Don't Find The Block. Make The List." className="w-full h-auto rounded-xl" />
      </div>
      <div>
        <h1 className="text-3xl font-black">Recent Blocks</h1>
        <p className="text-white/40 text-sm mt-1">Blocks found by the Unlucky21 pool.</p>
      </div>

      {blocks.length === 0 ? (
        <div className="rounded-xl border border-white/10 p-16 text-center space-y-3">
          <div className="text-5xl font-black text-white/10">0</div>
          <p className="text-white/30 text-sm">Unlucky21 has not found any blocks…. YET</p>
          <p className="text-white/20 text-xs">Be the first — connect your miner.</p>
          <a href="/join" className="inline-block mt-2 text-xs text-yellow-500 hover:text-yellow-400 transition-colors">
            How to connect →
          </a>
        </div>
      ) : (
        <div className="rounded-xl border border-white/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/5 text-white/40 text-xs font-medium">
                <th className="text-left px-4 py-3">Height</th>
                <th className="text-left px-4 py-3 hidden sm:table-cell">Found</th>
                <th className="text-left px-4 py-3">Finder</th>
                <th className="text-right px-4 py-3 hidden md:table-cell">Fees</th>
                <th className="text-right px-4 py-3">Slots</th>
              </tr>
            </thead>
            <tbody>
              {blocks.map(block => (
                <tr key={block.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                  <td className="px-4 py-3 font-mono font-bold text-yellow-400">
                    {block.height.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-white/40 text-xs hidden sm:table-cell">
                    {timeAgo(block.foundAt)}
                  </td>
                  <td className="px-4 py-3">
                    <a
                      href={`/miner/${block.finderAddress}`}
                      className="font-mono text-xs hover:text-yellow-400 transition-colors"
                    >
                      {truncate(block.finderAddress)}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-right text-white/40 text-xs hidden md:table-cell">
                    {formatBTC(block.blockFeesSats)}
                  </td>
                  <td className="px-4 py-3 text-right text-xs font-bold">
                    {block.slotsFilled}
                    <span className="text-white/30 font-normal"> / 21</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
