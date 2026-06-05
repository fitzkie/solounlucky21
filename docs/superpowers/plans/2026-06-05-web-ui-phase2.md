# Unlucky21 Web UI Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build out all 9 pages of the Unlucky21 website with real data, brand styling, and hardware connection guides, ready for signet testnet miner recruitment.

**Architecture:** Next.js 15 App Router server components with direct DB calls; shared formatting utilities in `web/lib/format.ts`; external stats (BTC price, network hashrate/difficulty) in `web/lib/external.ts` with 60s in-memory cache; all pages `force-dynamic`.

**Tech Stack:** Next.js 15, TypeScript, Tailwind CSS, pg 8.x (PostgreSQL), mempool.space public API

---

## File Map

**New files:**
- `web/lib/format.ts` — shared helpers: BTC, hashrate, duration, truncate, timeAgo, blockProbability
- `web/lib/external.ts` — mempool.space fetch with 60s module-level cache
- `web/app/api/external-stats/route.ts` — HTTP wrapper for external.ts
- `web/app/stats/page.tsx` — Stats page
- `web/app/connect/page.tsx` — Connect page with hardware guides
- `web/app/leaderboard/page.tsx` — Full leaderboard (top 100, top-21 highlighted)
- `web/app/blocks/page.tsx` — Recent blocks
- `web/app/reward-rules/page.tsx` — Reward Rules
- `web/app/miner/page.tsx` — My Stats address search
- `web/app/miner/[address]/page.tsx` — My Stats detail
- `web/app/faq/page.tsx` — FAQ
- `web/app/disclaimer/page.tsx` — Transparency/Disclaimer

**Modified files:**
- `web/app/globals.css` — add `--gold` CSS variable
- `web/app/layout.tsx` — 9-tab nav + branded footer
- `web/app/page.tsx` — home page redesign (no leaderboard table)
- `web/lib/db.ts` — expand `LeaderboardEntry`, add `getExtendedPoolStats`, increase leaderboard limit to 100, add per-address hashrate
- `web/app/api/stats/route.ts` — return `ExtendedPoolStats`
- `web/app/api/leaderboard/route.ts` — pass limit=100

---

### Task 1: Shared formatting utilities

**Files:**
- Create: `web/lib/format.ts`
- Modify: `web/app/page.tsx` (remove inline helpers, import from format.ts)

- [ ] **Step 1: Create `web/lib/format.ts`**

```typescript
export function formatBTC(sats: number): string {
  return (sats / 100_000_000).toFixed(4) + ' BTC'
}

export function truncate(addr: string, front = 10, back = 8): string {
  return addr.length > front + back + 1
    ? addr.slice(0, front) + '…' + addr.slice(-back)
    : addr
}

export function timeAgo(date: Date | string): string {
  const secs = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (secs < 60) return `${secs}s ago`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  return `${Math.floor(secs / 86400)}d ago`
}

export function formatHashrate(hs: number): string {
  if (hs < 1_000) return `${hs.toFixed(1)} H/s`
  if (hs < 1_000_000) return `${(hs / 1_000).toFixed(1)} KH/s`
  if (hs < 1_000_000_000) return `${(hs / 1_000_000).toFixed(1)} MH/s`
  if (hs < 1e12) return `${(hs / 1_000_000_000).toFixed(1)} GH/s`
  if (hs < 1e15) return `${(hs / 1e12).toFixed(1)} TH/s`
  if (hs < 1e18) return `${(hs / 1e15).toFixed(1)} PH/s`
  return `${(hs / 1e18).toFixed(1)} EH/s`
}

export function formatDuration(seconds: number): string {
  if (seconds < 3600) return `~${Math.round(seconds / 60)} minutes`
  if (seconds < 86400) return `~${(seconds / 3600).toFixed(1)} hours`
  if (seconds < 86400 * 30) return `~${(seconds / 86400).toFixed(1)} days`
  if (seconds < 86400 * 365) return `~${(seconds / (86400 * 30)).toFixed(1)} months`
  return `~${(seconds / (86400 * 365)).toFixed(1)} years`
}

// P(find block within t seconds) = 1 - e^(-t / expectedSeconds)
// Atlas Pool infographic formula
export function blockProbability(expectedSeconds: number, windowSeconds: number): string {
  if (expectedSeconds <= 0) return '0%'
  const p = 1 - Math.exp(-windowSeconds / expectedSeconds)
  if (p < 0.001) return '<0.1%'
  return `${(p * 100).toFixed(2)}%`
}
```

- [ ] **Step 2: Update `web/app/page.tsx` — remove duplicate helpers**

Remove the `formatBTC`, `truncate`, and `timeAgo` function definitions that appear at the top of the file (lines 5–19) and add this import:

```typescript
import { formatBTC, truncate, timeAgo } from '@/lib/format'
```

- [ ] **Step 3: Verify build**

```bash
cd "/Users/brianfitzgerald/untitled folder/solounlucky21/web" && npm run build 2>&1 | tail -20
```

Expected: no TypeScript errors, all existing routes still compile.

- [ ] **Step 4: Commit**

```bash
git add web/lib/format.ts web/app/page.tsx
git commit -m "feat: shared formatting utilities in lib/format.ts"
```

---

### Task 2: Nav, footer, and globals

**Files:**
- Modify: `web/app/globals.css`
- Modify: `web/app/layout.tsx`

- [ ] **Step 1: Add gold variable to `web/app/globals.css`**

Add `--gold: #D4A017;` inside the `:root` block so it sits alongside the existing variables.

- [ ] **Step 2: Replace `web/app/layout.tsx` entirely**

```typescript
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Unlucky21 — Bitcoin Solo Mining Pool',
  description: "Don't find the block. Make the list.",
}

const NAV_LINKS = [
  { href: '/',             label: 'Home' },
  { href: '/stats',        label: 'Stats' },
  { href: '/connect',      label: 'Connect' },
  { href: '/leaderboard',  label: 'Leaderboard' },
  { href: '/blocks',       label: 'Blocks' },
  { href: '/reward-rules', label: 'Reward Rules' },
  { href: '/miner',        label: 'My Stats' },
  { href: '/faq',          label: 'FAQ' },
  { href: '/disclaimer',   label: 'Disclaimer' },
]

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-black text-white antialiased">
        <header className="border-b border-white/10 px-4 py-3 sticky top-0 z-50 bg-black/95 backdrop-blur">
          <div className="max-w-6xl mx-auto flex items-center gap-4">
            <a href="/" className="flex items-center gap-2 shrink-0">
              <div className="w-8 h-8 rounded-full border-2 border-yellow-500 flex items-center justify-center text-yellow-500 font-black text-xs select-none">
                U21
              </div>
              <span className="font-black tracking-tight text-white text-sm hidden lg:block">UNLUCKY21</span>
            </a>
            <nav className="flex gap-0.5 text-xs overflow-x-auto scrollbar-none flex-1">
              {NAV_LINKS.map(l => (
                <a
                  key={l.href}
                  href={l.href}
                  className="px-2.5 py-1.5 rounded text-white/50 hover:text-white hover:bg-white/5 whitespace-nowrap transition-colors"
                >
                  {l.label}
                </a>
              ))}
            </nav>
          </div>
        </header>

        <main className="max-w-6xl mx-auto px-4 py-10">
          {children}
        </main>

        <footer className="border-t border-white/10 px-4 py-8 mt-16">
          <div className="max-w-6xl mx-auto space-y-3">
            <p className="text-xs text-white/30 text-center max-w-2xl mx-auto">
              Unlucky21 is in beta. No payouts are guaranteed. Participation involves risk —{' '}
              <a href="/disclaimer" className="text-yellow-500/70 hover:text-yellow-500 transition-colors">
                see the full Disclaimer
              </a>.
            </p>
            <div className="flex justify-center gap-6 text-xs text-white/30">
              <a href="https://t.me/unlucky21solopool" target="_blank" rel="noopener noreferrer" className="hover:text-white/60 transition-colors">Telegram</a>
              <a href="https://x.com/unlucky21pool" target="_blank" rel="noopener noreferrer" className="hover:text-white/60 transition-colors">X (Twitter)</a>
              <a href="/disclaimer" className="hover:text-white/60 transition-colors">Disclaimer</a>
              <a href="https://github.com/fitzkie/unlucky21" target="_blank" rel="noopener noreferrer" className="hover:text-white/60 transition-colors">GitHub</a>
            </div>
          </div>
        </footer>
      </body>
    </html>
  )
}
```

- [ ] **Step 3: Build check**

```bash
cd "/Users/brianfitzgerald/untitled folder/solounlucky21/web" && npm run build 2>&1 | tail -20
```

- [ ] **Step 4: Commit**

```bash
git add web/app/globals.css web/app/layout.tsx
git commit -m "feat: 9-tab nav + branded footer with beta disclaimer"
```

---

### Task 3: Expand DB layer

**Files:**
- Modify: `web/lib/db.ts`

- [ ] **Step 1: Expand `LeaderboardEntry` and update `getLeaderboard`**

Replace the existing `LeaderboardEntry` interface:

```typescript
export interface LeaderboardEntry {
  rank: number
  btcAddress: string
  bestShare: string
  lastSeen: Date
  estimatedPayoutSats: number
  hashrate7dThs: number    // estimated 7-day hashrate in TH/s
}
```

Replace the entire `getLeaderboard` function:

```typescript
export async function getLeaderboard(limit = 100): Promise<LeaderboardEntry[]> {
  const db = getPool()

  const roundRow = await db.query<{ id: number }>(
    `SELECT id FROM rounds WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1`
  )
  if (roundRow.rows.length === 0) return []
  const roundId = roundRow.rows[0].id

  const result = await db.query<{
    btc_address: string
    best_share: string
    last_seen: Date
    rank: number
    hashrate_7d_hs: string
  }>(
    `SELECT
       btc_address,
       MAX(share_difficulty)::TEXT                                   AS best_share,
       MAX(submitted_at)                                             AS last_seen,
       RANK() OVER (ORDER BY MAX(share_difficulty) DESC)::INT        AS rank,
       (SUM(share_difficulty) * 4294967296.0 / (7.0 * 86400))::TEXT AS hashrate_7d_hs
     FROM shares
     WHERE round_id = $1
       AND submitted_at > NOW() - INTERVAL '7 days'
       AND is_stale = false
     GROUP BY btc_address
     ORDER BY MAX(share_difficulty) DESC
     LIMIT $2`,
    [roundId, limit]
  )

  const { perSlot } = calcPayouts(SUBSIDY_SATS, 0, result.rows.length)

  return result.rows.map(row => ({
    rank: row.rank,
    btcAddress: row.btc_address,
    bestShare: row.best_share,
    lastSeen: row.last_seen,
    estimatedPayoutSats: perSlot,
    hashrate7dThs: parseFloat(row.hashrate_7d_hs) / 1e12,
  }))
}
```

Note: `4294967296 = 2^32`. The hashrate formula is `sum(share_difficulty) × 2^32 / (7 × 86400 seconds)`.

- [ ] **Step 2: Add `ExtendedPoolStats` interface and `getExtendedPoolStats` function**

Append after the existing `getPoolStats` function:

```typescript
export interface ExtendedPoolStats extends PoolStats {
  acceptedSharesTotal: number
  bestShareEver: string        // decimal string — BigInt safe
  minTop21Share: string | null // null if fewer than 21 miners in leaderboard
  poolHashrateHs: number       // estimated from last 10 minutes of shares
}

export async function getExtendedPoolStats(): Promise<ExtendedPoolStats> {
  const db = getPool()
  const base = await getPoolStats()

  const result = await db.query<{
    accepted_total: string
    best_ever: string
    min_top21: string | null
    pool_hashrate_hs: string
  }>(
    `WITH best_per_address AS (
       SELECT btc_address,
              MAX(share_difficulty) AS best_share
       FROM shares
       WHERE submitted_at > NOW() - INTERVAL '7 days'
         AND is_stale = false
       GROUP BY btc_address
     ),
     ranked AS (
       SELECT best_share,
              RANK() OVER (ORDER BY best_share DESC) AS rnk
       FROM best_per_address
     )
     SELECT
       (SELECT COUNT(*)::TEXT FROM shares WHERE is_stale = false)          AS accepted_total,
       (SELECT MAX(share_difficulty)::TEXT FROM shares)                    AS best_ever,
       (SELECT MIN(best_share)::TEXT FROM ranked WHERE rnk <= 21)          AS min_top21,
       (SELECT (COALESCE(SUM(share_difficulty), 0) * 4294967296.0 / 600)::TEXT
          FROM shares
          WHERE submitted_at > NOW() - INTERVAL '10 minutes'
            AND is_stale = false)                                           AS pool_hashrate_hs`
  )

  const row = result.rows[0]
  return {
    ...base,
    acceptedSharesTotal: parseInt(row.accepted_total ?? '0', 10),
    bestShareEver: row.best_ever ?? '0',
    minTop21Share: row.min_top21 ?? null,
    poolHashrateHs: parseFloat(row.pool_hashrate_hs ?? '0'),
  }
}
```

- [ ] **Step 3: Build check**

```bash
cd "/Users/brianfitzgerald/untitled folder/solounlucky21/web" && npm run build 2>&1 | tail -20
```

Expected: no errors. The existing leaderboard API route still calls `getLeaderboard()` and gets the default limit=100.

- [ ] **Step 4: Commit**

```bash
git add web/lib/db.ts
git commit -m "feat: DB — leaderboard top 100, per-address hashrate, pool hashrate, min top-21 share"
```

---

### Task 4: External stats API

**Files:**
- Create: `web/lib/external.ts`
- Create: `web/app/api/external-stats/route.ts`
- Modify: `web/app/api/stats/route.ts`

- [ ] **Step 1: Create `web/lib/external.ts`**

```typescript
export interface ExternalStats {
  btcPriceUsd: number | null
  networkHashrateHs: number | null
  networkDifficulty: number | null
  fetchedAt: number
}

let _cache: ExternalStats | null = null
const TTL = 60_000

export async function getExternalStats(): Promise<ExternalStats> {
  if (_cache && Date.now() - _cache.fetchedAt < TTL) return _cache

  let btcPriceUsd: number | null = null
  let networkHashrateHs: number | null = null
  let networkDifficulty: number | null = null

  try {
    const r = await fetch('https://mempool.space/api/v1/prices', { cache: 'no-store' })
    if (r.ok) {
      const d = await r.json()
      btcPriceUsd = typeof d.USD === 'number' ? d.USD : null
    }
  } catch { /* leave null */ }

  try {
    const r = await fetch('https://mempool.space/signet/api/v1/mining/hashrate/1m', { cache: 'no-store' })
    if (r.ok) {
      const d = await r.json()
      networkHashrateHs = typeof d.currentHashrate === 'number' ? d.currentHashrate : null
      networkDifficulty = typeof d.currentDifficulty === 'number' ? d.currentDifficulty : null
    }
  } catch { /* leave null */ }

  _cache = { btcPriceUsd, networkHashrateHs, networkDifficulty, fetchedAt: Date.now() }
  return _cache
}
```

- [ ] **Step 2: Create `web/app/api/external-stats/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { getExternalStats } from '@/lib/external'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const stats = await getExternalStats()
    return NextResponse.json(stats)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: 'Failed to load external stats', detail: msg }, { status: 500 })
  }
}
```

- [ ] **Step 3: Replace `web/app/api/stats/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { getExtendedPoolStats } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const stats = await getExtendedPoolStats()
    return NextResponse.json(stats)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: 'Failed to load stats', detail: msg }, { status: 500 })
  }
}
```

- [ ] **Step 4: Build check**

```bash
cd "/Users/brianfitzgerald/untitled folder/solounlucky21/web" && npm run build 2>&1 | tail -20
```

- [ ] **Step 5: Commit**

```bash
git add web/lib/external.ts web/app/api/external-stats/route.ts web/app/api/stats/route.ts
git commit -m "feat: external-stats API with 60s cache — BTC price, signet network hashrate/difficulty"
```

---

### Task 5: Home page redesign

**Files:**
- Modify: `web/app/page.tsx`

Home page is a long scroll. No leaderboard table. Sections match the nav tab order.

- [ ] **Step 1: Replace `web/app/page.tsx` entirely**

```typescript
import { getPoolStats, getLeaderboard } from '@/lib/db'
import { formatBTC } from '@/lib/format'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const [stats, leaderboard] = await Promise.all([getPoolStats(), getLeaderboard(21)])

  const perSlotBtc = leaderboard[0] ? formatBTC(leaderboard[0].estimatedPayoutSats) : '—'
  const slotsLabel = `${leaderboard.length} / 21`

  return (
    <div className="space-y-20">

      {/* ── Hero ── */}
      <section className="text-center py-12 space-y-5">
        <div className="inline-flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/30 rounded-full px-4 py-1.5 text-xs text-yellow-500 font-bold tracking-widest uppercase">
          Beta · Signet Testnet
        </div>
        <h1 className="text-4xl md:text-6xl font-black tracking-tight leading-none">
          DON&apos;T FIND THE BLOCK.
          <br />
          <span className="text-yellow-400">MAKE THE LIST.</span>
        </h1>
        <p className="text-white/50 text-base md:text-lg max-w-xl mx-auto">
          The Bitcoin Pool Where Finding The Block Doesn&apos;t Matter™
        </p>
        <div className="flex justify-center gap-3 pt-2">
          <a
            href="https://t.me/unlucky21solopool"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-[#229ED9] hover:bg-[#1a8bc2] text-white font-bold px-5 py-2.5 rounded-xl text-sm transition-colors"
          >
            Join Telegram
          </a>
          <a
            href="https://x.com/unlucky21pool"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white font-bold px-5 py-2.5 rounded-xl text-sm transition-colors border border-white/10"
          >
            Follow on X
          </a>
        </div>
      </section>

      {/* ── Pool Stats Snapshot ── */}
      <section className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xs font-bold uppercase tracking-widest text-white/40">Pool Stats</h2>
          <a href="/stats" className="text-xs text-yellow-500 hover:text-yellow-400 transition-colors">Full stats →</a>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Blocks Found',           value: stats.totalBlocks.toString() },
            { label: 'Active Miners (7d)',      value: stats.activeMiners7d.toString() },
            { label: 'Slots Filled',            value: slotsLabel },
            { label: 'Est. BTC/Slot if Found',  value: perSlotBtc },
          ].map(s => (
            <div key={s.label} className="bg-white/5 rounded-xl p-4 border border-white/10">
              <div className="text-2xl font-black text-yellow-400">{s.value}</div>
              <div className="text-xs text-white/40 mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── How Each Block Pays Out ── */}
      <section className="space-y-6">
        <h2 className="text-xs font-bold uppercase tracking-widest text-white/40">How Each Block Pays Out</h2>

        <div className="rounded-xl overflow-hidden border border-white/10">
          <div className="flex text-xs font-bold h-10">
            <div className="bg-yellow-500" style={{ width: '2.1%' }} title="Finder 2.1%" />
            <div className="bg-yellow-800" style={{ width: '2.1%' }} title="Pool Fee 2.1%" />
            <div className="bg-yellow-500/20 text-yellow-400 flex items-center justify-center flex-1 text-xs">
              95.8% → Top 21 Split Equally
            </div>
          </div>
          <div className="flex gap-6 text-xs text-white/40 px-4 py-2 bg-white/5">
            <span><span className="text-yellow-400 font-bold">2.1%</span> Finder</span>
            <span><span className="text-yellow-700 font-bold">2.1%</span> Pool Fee</span>
            <span><span className="text-yellow-400 font-bold">95.8%</span> Top 21 equal split</span>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4 text-sm">
          <div className="rounded-xl border border-white/10 p-5 space-y-2">
            <h3 className="font-bold text-white/50 text-xs uppercase tracking-widest">Traditional Solo Mining</h3>
            <ul className="text-white/50 space-y-1">
              <li>Find the block → win everything</li>
              <li>Everyone else → win nothing</li>
            </ul>
          </div>
          <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-5 space-y-2">
            <h3 className="font-bold text-yellow-400 text-xs uppercase tracking-widest">Unlucky21™</h3>
            <ul className="text-white/70 space-y-1">
              <li>Find the block → receive a small bonus (2.1%)</li>
              <li>Make the Top 21 → receive the biggest rewards</li>
            </ul>
          </div>
        </div>

        <p className="text-center text-sm text-white/40">
          Find the block. Get <span className="text-yellow-400 font-bold">2.1%</span>.
          &nbsp;&nbsp;Make the list. Get <span className="text-yellow-400 font-bold">paid</span>.
        </p>
      </section>

      {/* ── Quality Over Quantity ── */}
      <section className="rounded-xl border border-white/10 p-8 space-y-3">
        <h2 className="text-xl font-black">Quality Over Quantity</h2>
        <p className="text-white/60 leading-relaxed text-sm">
          Only your single best share this round determines your rank. Higher hashrate means a
          statistically better chance of producing a high-quality share — but you don&apos;t need to
          outwork everyone, just outperform on one share.
        </p>
      </section>

      {/* ── Mine When You Want ── */}
      <section className="rounded-xl border border-white/10 p-8 space-y-3">
        <h2 className="text-xl font-black">Mine When You Want</h2>
        <p className="text-white/60 leading-relaxed text-sm">
          Once you&apos;re in the Best 21 list, you&apos;re free to stop. You&apos;ll collect your reward if and
          when a block is found — no need to keep mining. Just check your rank from time to time.
          If you&apos;ve dropped below #21, fire up your miner again to reclaim your spot.
        </p>
      </section>

      {/* ── Connect Snippet ── */}
      <section className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xs font-bold uppercase tracking-widest text-white/40">Connect Your Miner</h2>
          <a href="/connect" className="text-xs text-yellow-500 hover:text-yellow-400 transition-colors">Full guide with hardware examples →</a>
        </div>
        <div className="rounded-xl border border-white/10 p-6 grid md:grid-cols-3 gap-4">
          {[
            { label: 'Stratum URL', value: 'stratum+tcp://bitcoin.unlucky21.com:3333' },
            { label: 'Username',    value: 'your_bitcoin_address' },
            { label: 'Password',    value: 'x  (anything)' },
          ].map(item => (
            <div key={item.label}>
              <div className="text-white/40 text-xs mb-1">{item.label}</div>
              <code className="bg-white/5 text-yellow-400 px-2 py-1.5 rounded text-xs font-mono block break-all">
                {item.value}
              </code>
            </div>
          ))}
        </div>
      </section>

      {/* ── Reward Rules Teaser ── */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xs font-bold uppercase tracking-widest text-white/40">Reward Rules</h2>
          <a href="/reward-rules" className="text-xs text-yellow-500 hover:text-yellow-400 transition-colors">Full rules →</a>
        </div>
        <p className="text-white/50 text-sm leading-relaxed">
          Your rank is based on your single highest-difficulty share submitted in the last 7 days.
          The leaderboard resets to zero the moment Unlucky21 finds a block — every slot opens
          and the race begins again from scratch.
        </p>
      </section>

      {/* ── Community ── */}
      <section className="text-center py-10 space-y-5 border-t border-white/10">
        <h2 className="text-xs font-bold uppercase tracking-widest text-white/40">Join the Community</h2>
        <div className="flex justify-center gap-4">
          <a
            href="https://t.me/unlucky21solopool"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-[#229ED9] hover:bg-[#1a8bc2] text-white font-bold px-6 py-3 rounded-xl text-sm transition-colors"
          >
            Join Telegram
          </a>
          <a
            href="https://x.com/unlucky21pool"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white font-bold px-6 py-3 rounded-xl text-sm transition-colors border border-white/10"
          >
            Follow on X
          </a>
        </div>
      </section>

    </div>
  )
}
```

- [ ] **Step 2: Build check**

```bash
cd "/Users/brianfitzgerald/untitled folder/solounlucky21/web" && npm run build 2>&1 | tail -20
```

- [ ] **Step 3: Commit**

```bash
git add web/app/page.tsx
git commit -m "feat: home page redesign — hero, payout bar, quality/mine-when-you-want, community"
```

---

### Task 6: Stats page

**Files:**
- Create: `web/app/stats/page.tsx`

- [ ] **Step 1: Create `web/app/stats/page.tsx`**

```typescript
import { getExtendedPoolStats } from '@/lib/db'
import { getExternalStats } from '@/lib/external'
import { formatHashrate, formatDuration, blockProbability } from '@/lib/format'

export const dynamic = 'force-dynamic'

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white/5 rounded-xl p-5 border border-white/10">
      <div className="text-2xl font-black text-yellow-400 tabular-nums">{value}</div>
      <div className="text-xs text-white/40 mt-1">{label}</div>
      {sub && <div className="text-xs text-white/25 mt-0.5">{sub}</div>}
    </div>
  )
}

export default async function StatsPage() {
  const [stats, ext] = await Promise.all([getExtendedPoolStats(), getExternalStats()])

  const poolHs = stats.poolHashrateHs
  const netDiff = ext.networkDifficulty

  // expectedSeconds = (networkDifficulty × 2^32) / poolHashrateHs
  // Atlas Pool formula: P(t) = 1 - e^(-t / expectedSeconds)
  const expectedSeconds =
    poolHs > 0 && netDiff && netDiff > 0
      ? (netDiff * 4_294_967_296) / poolHs
      : null

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-3xl font-black">Pool Stats</h1>
        <p className="text-white/40 text-sm mt-1">
          Pool data is live. External data (BTC price, network) cached for 60 seconds.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-widest text-white/40">Pool</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <StatCard label="Blocks Found" value={stats.totalBlocks.toString()} />
          <StatCard label="Active Miners (7d)" value={stats.activeMiners7d.toString()} />
          <StatCard label="Accepted Shares (all-time)" value={stats.acceptedSharesTotal.toLocaleString()} />
          <StatCard
            label="All-Time Best Share"
            value={BigInt(stats.bestShareEver).toLocaleString()}
          />
          <StatCard
            label="Min Share to Enter Top 21"
            value={stats.minTop21Share ? BigInt(stats.minTop21Share).toLocaleString() : 'Any share'}
            sub={stats.minTop21Share ? 'current #21 threshold' : 'fewer than 21 miners — join now!'}
          />
          <StatCard
            label="Pool Hashrate (10 min)"
            value={poolHs > 0 ? formatHashrate(poolHs) : '—'}
            sub="estimated from recent shares"
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-widest text-white/40">Network (Signet)</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <StatCard
            label="BTC Price"
            value={ext.btcPriceUsd ? `$${ext.btcPriceUsd.toLocaleString()}` : '—'}
            sub="mainnet · mempool.space"
          />
          <StatCard
            label="Network Hashrate"
            value={ext.networkHashrateHs ? formatHashrate(ext.networkHashrateHs) : '—'}
            sub="signet · mempool.space"
          />
          <StatCard
            label="Network Difficulty"
            value={netDiff ? netDiff.toLocaleString() : '—'}
            sub="signet"
          />
        </div>
      </section>

      {expectedSeconds ? (
        <section className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-widest text-white/40">Block Probability</h2>
          <p className="text-xs text-white/30">
            Formula: expected time = (difficulty × 2³²) / pool_hashrate.
            Probability P(t) = 1 − e<sup>−t/expected</sup> (exponential distribution, Atlas Pool method).
            Assumes steady hashrate.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Expected Time to Block" value={formatDuration(expectedSeconds)} />
            <StatCard label="Chance in 24 hours" value={blockProbability(expectedSeconds, 86_400)} />
            <StatCard label="Chance in 7 days" value={blockProbability(expectedSeconds, 604_800)} />
            <StatCard label="Chance in 30 days" value={blockProbability(expectedSeconds, 2_592_000)} />
          </div>
        </section>
      ) : (
        <div className="rounded-xl border border-white/10 p-8 text-center text-white/30 text-sm">
          Block probability unavailable — pool hashrate is 0. Connect a miner to see estimates.
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Build check and commit**

```bash
cd "/Users/brianfitzgerald/untitled folder/solounlucky21/web" && npm run build 2>&1 | tail -20
git add web/app/stats/page.tsx
git commit -m "feat: stats page — pool hashrate, network stats, block probability estimates"
```

---

### Task 7: Connect page

**Files:**
- Create: `web/app/connect/page.tsx`

- [ ] **Step 1: Create `web/app/connect/page.tsx`**

```typescript
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
      <div>
        <h1 className="text-3xl font-black">Connect Your Miner</h1>
        <p className="text-white/40 text-sm mt-2">
          Currently running on <strong className="text-yellow-400">signet (testnet)</strong>.
          Use a signet Bitcoin address — not a mainnet address.
        </p>
      </div>

      {/* Pool connection details */}
      <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-6 space-y-4">
        <h2 className="text-lg font-black">Pool Connection Details</h2>
        <div className="grid md:grid-cols-3 gap-4">
          {[
            { label: 'Stratum URL', value: 'stratum+tcp://bitcoin.unlucky21.com:3333' },
            { label: 'Username',    value: 'your_signet_btc_address' },
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

      {/* Bitaxe */}
      <HardwareSection title="Bitaxe">
        <ol className="text-white/60 space-y-1.5 list-decimal list-inside">
          <li>Open your Bitaxe web UI (usually <code className="text-yellow-400">http://bitaxe.local</code> or its IP address)</li>
          <li>Go to <strong className="text-white">Settings</strong></li>
          <li>Fill in the pool fields:</li>
        </ol>
        <FieldGrid fields={[
          { label: 'Hostname',  value: 'bitcoin.unlucky21.com' },
          { label: 'Port',      value: '3333' },
          { label: 'Username',  value: 'your_signet_address' },
          { label: 'Password',  value: 'x' },
        ]} />
        <p className="text-white/50">4. Click <strong className="text-white">Save</strong> — Bitaxe reconnects automatically.</p>
      </HardwareSection>

      {/* Avalon Nano */}
      <HardwareSection title="Avalon Nano">
        <ol className="text-white/60 space-y-1.5 list-decimal list-inside">
          <li>Connect the Avalon Nano via USB and open its control app or web UI</li>
          <li>Go to <strong className="text-white">Pool Settings</strong></li>
          <li>Set Pool 1:</li>
        </ol>
        <CodeBlock>{`URL:      stratum+tcp://bitcoin.unlucky21.com:3333\nWorker:   your_signet_btc_address\nPassword: x`}</CodeBlock>
        <p className="text-white/50">4. Save and restart the device.</p>
      </HardwareSection>

      {/* cpuminer */}
      <HardwareSection title="cpuminer (CPU / testing)">
        <p className="text-white/60">Run this command in your terminal:</p>
        <CodeBlock>{`cpuminer -a sha256d \\\n  -o stratum+tcp://bitcoin.unlucky21.com:3333 \\\n  -u YOUR_SIGNET_BTC_ADDRESS \\\n  -p x`}</CodeBlock>
        <p className="text-white/30 text-xs">
          CPU mining produces very low-difficulty shares. Good for testing connectivity — not competitive for the leaderboard.
        </p>
      </HardwareSection>

      {/* Braiins */}
      <HardwareSection title="Braiins Pool (Hash Rental)">
        <p className="text-white/60">Braiins allows you to rent hashrate and direct it to a custom pool.</p>
        <ol className="text-white/60 space-y-1.5 list-decimal list-inside">
          <li>Sign in at <a href="https://pool.braiins.com" className="text-yellow-400 hover:underline" target="_blank" rel="noopener noreferrer">pool.braiins.com</a></li>
          <li>Go to <strong className="text-white">Settings → Worker Configuration</strong></li>
          <li>Set custom pool endpoint:</li>
        </ol>
        <CodeBlock>{`stratum+tcp://bitcoin.unlucky21.com:3333`}</CodeBlock>
        <ol className="text-white/60 space-y-1.5 list-decimal list-inside" start={4}>
          <li>Set username to your signet BTC address</li>
          <li>Save and start the rental</li>
        </ol>
      </HardwareSection>

      {/* NiceHash */}
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
          { label: 'Username',  value: 'your_signet_address' },
          { label: 'Password',  value: 'x' },
        ]} />
        <p className="text-white/50">5. Place the order. Hash arrives at the pool within minutes.</p>
      </HardwareSection>
    </div>
  )
}
```

- [ ] **Step 2: Build check and commit**

```bash
cd "/Users/brianfitzgerald/untitled folder/solounlucky21/web" && npm run build 2>&1 | tail -20
git add web/app/connect/page.tsx
git commit -m "feat: connect page — Bitaxe, Avalon Nano, cpuminer, Braiins, NiceHash guides"
```

---

### Task 8: Leaderboard page

**Files:**
- Create: `web/app/leaderboard/page.tsx`

- [ ] **Step 1: Create `web/app/leaderboard/page.tsx`**

```typescript
import { getLeaderboard } from '@/lib/db'
import { formatBTC, truncate, timeAgo } from '@/lib/format'

export const dynamic = 'force-dynamic'

export default async function LeaderboardPage() {
  const leaderboard = await getLeaderboard(100)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black">Leaderboard</h1>
        <p className="text-white/40 text-sm mt-1">
          Top 100 by 7-day best share. Rows 1–21 receive a payout when the pool finds a block.
        </p>
      </div>

      <div className="rounded-xl bg-yellow-500/10 border border-yellow-500/30 px-5 py-3 text-sm text-yellow-400">
        The leaderboard resets to zero the moment Unlucky21 finds a block. Every slot opens.
      </div>

      <div className="rounded-xl border border-white/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 bg-white/5 text-white/40 text-xs font-medium">
              <th className="text-left px-4 py-3 w-12">Rank</th>
              <th className="text-left px-4 py-3">Address</th>
              <th className="text-right px-4 py-3 hidden md:table-cell">Best Share</th>
              <th className="text-right px-4 py-3 hidden md:table-cell">Est. Hashrate</th>
              <th className="text-right px-4 py-3 hidden sm:table-cell">Last Active</th>
              <th className="text-right px-4 py-3">Est. Payout</th>
            </tr>
          </thead>
          <tbody>
            {leaderboard.map((entry) => {
              const inTop21 = entry.rank <= 21
              const isHomeMiner = entry.hashrate7dThs < 100
              return (
                <tr
                  key={entry.btcAddress}
                  className={[
                    'border-b border-white/5 transition-colors',
                    inTop21
                      ? 'bg-yellow-500/5 hover:bg-yellow-500/10 border-l-2 border-l-yellow-500'
                      : 'hover:bg-white/5',
                  ].join(' ')}
                >
                  <td className="px-4 py-3 tabular-nums">
                    <span className={inTop21 ? 'text-yellow-400 font-bold' : 'text-white/30'}>
                      #{entry.rank}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <a
                        href={`/miner/${entry.btcAddress}`}
                        className="font-mono text-xs hover:text-yellow-400 transition-colors"
                      >
                        {truncate(entry.btcAddress)}
                      </a>
                      {isHomeMiner && (
                        <span className="text-xs bg-yellow-500/10 text-yellow-500 border border-yellow-500/30 rounded px-1.5 py-0.5 font-bold hidden sm:inline">
                          HOME
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-white/40 text-xs hidden md:table-cell">
                    {BigInt(entry.bestShare).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-white/40 text-xs hidden md:table-cell">
                    {entry.hashrate7dThs < 0.001
                      ? '< 0.001 TH/s'
                      : `${entry.hashrate7dThs.toFixed(3)} TH/s`}
                  </td>
                  <td className="px-4 py-3 text-right text-white/30 text-xs hidden sm:table-cell">
                    {timeAgo(entry.lastSeen)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium text-xs">
                    <span className={inTop21 ? 'text-yellow-400' : 'text-white/20'}>
                      {inTop21 ? formatBTC(entry.estimatedPayoutSats) : '—'}
                    </span>
                  </td>
                </tr>
              )
            })}

            {Array.from({ length: Math.max(0, 21 - leaderboard.length) }).map((_, i) => (
              <tr
                key={`empty-${i}`}
                className="border-b border-white/5 bg-yellow-500/5 border-l-2 border-l-yellow-500/30"
              >
                <td className="px-4 py-3">
                  <span className="text-yellow-500/30">#{leaderboard.length + i + 1}</span>
                </td>
                <td className="px-4 py-3 text-white/20 text-xs font-mono italic" colSpan={5}>
                  open slot — connect your miner
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-white/30 text-center">
        Rolling 7-day window — shares older than 7 days age out. Keep mining to hold your rank.
        &nbsp;HOME badge = estimated 7-day hashrate under 100 TH/s.
      </p>
    </div>
  )
}
```

- [ ] **Step 2: Build check and commit**

```bash
cd "/Users/brianfitzgerald/untitled folder/solounlucky21/web" && npm run build 2>&1 | tail -20
git add web/app/leaderboard/page.tsx
git commit -m "feat: leaderboard page — top 100, top-21 gold highlight, HOME miner badge"
```

---

### Task 9: Blocks page

**Files:**
- Create: `web/app/blocks/page.tsx`

- [ ] **Step 1: Create `web/app/blocks/page.tsx`**

```typescript
import { getBlocks } from '@/lib/db'
import { formatBTC, truncate, timeAgo } from '@/lib/format'

export const dynamic = 'force-dynamic'

export default async function BlocksPage() {
  const blocks = await getBlocks(50)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black">Recent Blocks</h1>
        <p className="text-white/40 text-sm mt-1">Blocks found by the Unlucky21 pool.</p>
      </div>

      {blocks.length === 0 ? (
        <div className="rounded-xl border border-white/10 p-16 text-center space-y-3">
          <div className="text-5xl font-black text-white/10">0</div>
          <p className="text-white/30 text-sm">No blocks found yet.</p>
          <p className="text-white/20 text-xs">Be the first — connect your miner.</p>
          <a href="/connect" className="inline-block mt-2 text-xs text-yellow-500 hover:text-yellow-400 transition-colors">
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
```

- [ ] **Step 2: Build check and commit**

```bash
cd "/Users/brianfitzgerald/untitled folder/solounlucky21/web" && npm run build 2>&1 | tail -20
git add web/app/blocks/page.tsx
git commit -m "feat: blocks page — found blocks table with empty state"
```

---

### Task 10: Reward Rules page

**Files:**
- Create: `web/app/reward-rules/page.tsx`

- [ ] **Step 1: Create `web/app/reward-rules/page.tsx`**

```typescript
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
```

- [ ] **Step 2: Build check and commit**

```bash
cd "/Users/brianfitzgerald/untitled folder/solounlucky21/web" && npm run build 2>&1 | tail -20
git add web/app/reward-rules/page.tsx
git commit -m "feat: reward rules page with payout bar and example calculation"
```

---

### Task 11: My Stats pages

**Files:**
- Create: `web/app/miner/page.tsx`
- Create: `web/app/miner/[address]/page.tsx`

- [ ] **Step 1: Create `web/app/miner/page.tsx`**

```typescript
export const dynamic = 'force-dynamic'

export default function MinerSearchPage() {
  return (
    <div className="max-w-xl space-y-8">
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
          placeholder="tb1q..."
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
```

- [ ] **Step 2: Create `web/app/miner/[address]/page.tsx`**

```typescript
import { getMinerStats } from '@/lib/db'
import { formatBTC, timeAgo } from '@/lib/format'

export const dynamic = 'force-dynamic'

export default async function MinerDetailPage({
  params,
}: {
  params: Promise<{ address: string }>
}) {
  const { address } = await params
  const stats = await getMinerStats(decodeURIComponent(address))

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-black">My Stats</h1>
        <p className="font-mono text-xs text-white/40 mt-2 break-all">{address}</p>
      </div>

      {!stats.currentRank ? (
        <div className="rounded-xl border border-white/10 p-12 text-center space-y-2">
          <p className="text-white/40 text-sm">This address is not on the current leaderboard.</p>
          <p className="text-white/25 text-xs">
            Connect your miner to start earning a rank.{' '}
            <a href="/connect" className="text-yellow-500 hover:underline">How to connect →</a>
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Current Rank',            value: `#${stats.currentRank}` },
            { label: 'Best Share (7d)',          value: stats.bestShare ? BigInt(stats.bestShare).toLocaleString() : '—' },
            { label: 'Last Active',             value: stats.lastSeen ? timeAgo(stats.lastSeen) : '—' },
            { label: 'Est. Payout if Found Now', value: stats.estimatedPayoutSats ? formatBTC(stats.estimatedPayoutSats) : '—' },
          ].map(s => (
            <div key={s.label} className="bg-white/5 rounded-xl p-4 border border-white/10">
              <div className="text-2xl font-black text-yellow-400">{s.value}</div>
              <div className="text-xs text-white/40 mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {stats.shareHistory.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-widest text-white/40">
            Share Activity — Last 7 Days (by hour)
          </h2>
          <div className="rounded-xl border border-white/10 overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-white/5 border-b border-white/10 text-white/40">
                  <th className="text-left px-4 py-2">Hour (UTC)</th>
                  <th className="text-right px-4 py-2">Shares</th>
                  <th className="text-right px-4 py-2">Best Difficulty</th>
                </tr>
              </thead>
              <tbody>
                {[...stats.shareHistory].reverse().slice(0, 48).map((row, i) => (
                  <tr key={i} className="border-b border-white/5 hover:bg-white/5">
                    <td className="px-4 py-2 font-mono text-white/50">
                      {new Date(row.hour).toISOString().slice(0, 16).replace('T', ' ')}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{row.count}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-yellow-400/70">
                      {BigInt(row.best).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {stats.blocksInTop21.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-widest text-white/40">
            Blocks in Top 21
          </h2>
          <div className="rounded-xl border border-white/10 overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-white/5 border-b border-white/10 text-white/40">
                  <th className="text-left px-4 py-2">Height</th>
                  <th className="text-left px-4 py-2">Found</th>
                  <th className="text-right px-4 py-2">Payout</th>
                </tr>
              </thead>
              <tbody>
                {stats.blocksInTop21.map((b, i) => (
                  <tr key={i} className="border-b border-white/5 hover:bg-white/5">
                    <td className="px-4 py-2 font-mono font-bold text-yellow-400">
                      {b.height.toLocaleString()}
                    </td>
                    <td className="px-4 py-2 text-white/40">{timeAgo(b.found_at)}</td>
                    <td className="px-4 py-2 text-right text-yellow-400">
                      {formatBTC(b.amount_sats)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Build check and commit**

```bash
cd "/Users/brianfitzgerald/untitled folder/solounlucky21/web" && npm run build 2>&1 | tail -20
git add web/app/miner/page.tsx "web/app/miner/[address]/page.tsx"
git commit -m "feat: My Stats pages — address search and miner detail with share history"
```

---

### Task 12: FAQ page

**Files:**
- Create: `web/app/faq/page.tsx`

- [ ] **Step 1: Create `web/app/faq/page.tsx`**

```typescript
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
```

- [ ] **Step 2: Build check and commit**

```bash
cd "/Users/brianfitzgerald/untitled folder/solounlucky21/web" && npm run build 2>&1 | tail -20
git add web/app/faq/page.tsx
git commit -m "feat: FAQ page — 10 Q&A cards"
```

---

### Task 13: Disclaimer page

**Files:**
- Create: `web/app/disclaimer/page.tsx`

- [ ] **Step 1: Create `web/app/disclaimer/page.tsx`**

```typescript
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
          <p>We have already tested the pool software and found 2 test blocks on signet. Development is ongoing.</p>
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
          <p>If your address submitted a best share just seconds before a block was found, it will not get paid — because it was not yet included in the block template distributed to the miner's device. If your address has been in the list for more than a minute when a block is found, this issue will not affect you.</p>
        </Risk>

        <Risk emoji="🎭" title="Malicious Pool Operator">
          <p>The operator could silently inject fake entries into Best 21 — addresses they control with fabricated share values. There is no cryptographic proof that any submitted share is genuine. The leaderboard you see could be entirely real, partially fake, or completely fabricated. You have no way to tell.</p>
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
```

- [ ] **Step 2: Build check and commit**

```bash
cd "/Users/brianfitzgerald/untitled folder/solounlucky21/web" && npm run build 2>&1 | tail -20
git add web/app/disclaimer/page.tsx
git commit -m "feat: transparency/disclaimer page with all 8 risk sections and legal disclaimer"
```

---

### Task 14: Deploy and smoke test

- [ ] **Step 1: Full clean build**

```bash
cd "/Users/brianfitzgerald/untitled folder/solounlucky21/web" && npm run build 2>&1
```

Expected: no errors. Build output lists all routes: `/`, `/stats`, `/connect`, `/leaderboard`, `/blocks`, `/reward-rules`, `/miner`, `/miner/[address]`, `/faq`, `/disclaimer`, plus all `/api/*` routes.

- [ ] **Step 2: Push to trigger Railway redeploy**

```bash
git push origin main
```

- [ ] **Step 3: Smoke test each route** (~90 seconds after push)

Visit each URL, confirm no server errors:

| URL | Expected |
|-----|----------|
| `/` | Hero + payout bar + connect snippet + community buttons |
| `/stats` | Stat cards, block probability or "no hashrate" message |
| `/connect` | 5 hardware sections visible |
| `/leaderboard` | Table with top-21 gold left border |
| `/blocks` | Empty state "No blocks found yet" |
| `/reward-rules` | Payout bar + 7 rule sections + example calculation |
| `/miner` | Address input + Look Up button |
| `/miner/tb1q63dma7jxx8zge4frxw94g2cahqt5l5qveava0d` | Rank #1, best share, share history table |
| `/faq` | 10 Q&A cards |
| `/disclaimer` | Yellow warning box + 8 risk sections + legal text |

- [ ] **Step 4: Verify API endpoints**

```bash
curl https://unlucky21-production.up.railway.app/api/stats | python3 -m json.tool | head -20
curl https://unlucky21-production.up.railway.app/api/external-stats | python3 -m json.tool
curl https://unlucky21-production.up.railway.app/api/leaderboard | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d['entries']), 'entries')"
```

Expected: `/api/stats` includes `poolHashrateHs`, `acceptedSharesTotal`, `bestShareEver`, `minTop21Share`. `/api/external-stats` includes `btcPriceUsd` (may be null on first load). `/api/leaderboard` returns up to 100 entries.

---

## Self-Review

**Spec coverage:**
- ✅ Home page: hero, stats snapshot, payout breakdown, Quality Over Quantity, Mine When You Want, connect snippet, reward rules teaser, community section
- ✅ Stats page: pool hashrate, network hashrate/difficulty, BTC price, block probability (Atlas Pool formula)
- ✅ Connect page: Bitaxe, Avalon Nano, cpuminer, Braiins, NiceHash
- ✅ Leaderboard: top 100, top-21 highlighted gold, HOME badge, open slots, reset banner
- ✅ Blocks page: table + empty state
- ✅ Reward Rules: payout bar, 7 sections, example calculation
- ✅ My Stats: search page + detail page with share history and blocks-in-top-21
- ✅ FAQ: 10 questions
- ✅ Disclaimer: 8 risk sections + legal disclaimer + alternative pools
- ✅ Social links (Telegram + X) in hero, community section, and footer
- ✅ Footer disclaimer on every page (layout.tsx)
- ✅ `/api/stats` expanded to `ExtendedPoolStats`
- ✅ `/api/external-stats` new endpoint with 60s cache
- ✅ Leaderboard query increased to limit=100 with `hashrate7dThs`

**Placeholder scan:** No TBDs, TODOs, or "similar to Task N" patterns present.

**Type consistency:**
- `LeaderboardEntry.hashrate7dThs` — defined Task 3, used Tasks 8, 11 ✅
- `getExtendedPoolStats()` — defined Task 3, used Tasks 4, 6 ✅
- `getExternalStats()` — defined Task 4, used Task 6 ✅
- `formatHashrate`, `formatDuration`, `blockProbability` — defined Task 1, used Task 6 ✅
- `getMinerStats` return fields `row.hour`, `row.count`, `row.best`, `b.found_at`, `b.amount_sats` — match existing DB query return types in `db.ts` ✅
