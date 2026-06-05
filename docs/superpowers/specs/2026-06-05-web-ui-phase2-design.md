# Unlucky21 Web UI — Phase 2 Design Spec

**Date:** 2026-06-05  
**Status:** Draft — awaiting user approval

---

## Overview

Full UI build-out for unlucky21-production.up.railway.app, targeting signet testnet recruitment. The site must communicate the pool's unique proposition (rank-based payout, not winner-takes-all), give miners everything they need to connect, and be transparent about beta status.

Primary goal: get real signet miners connecting and testing. Secondary goal: mainnet-ready copy and design so the same site goes live with minimal changes.

---

## Design System

- **Background:** `#0a0a0a` (near-black)
- **Gold accent:** `#D4A017`
- **Text:** white / `rgba(255,255,255,0.5)` for secondary
- **Font:** system sans-serif (existing)
- **Framework:** Tailwind CSS (existing)
- **Logo:** circular badge image (`/public/logo.png`) in header; horizontal banner image (`/public/banner.png`) used on hero only
- **Social links:** X → https://x.com/unlucky21pool · Telegram → https://t.me/unlucky21solopool

---

## Navigation

Single top nav bar, persistent across all pages. Tabs:

```
UNLUCKY21 [logo]   Home · Stats · Connect · Leaderboard · Blocks · Reward Rules · My Stats · FAQ · Disclaimer
```

Active tab highlighted in gold. On mobile: hamburger menu or horizontal scroll.

---

## Footer (every page)

One-line disclaimer:

> "Unlucky21 is in beta. No payouts are guaranteed. Participation involves risk — see the full Disclaimer."

Links: Telegram · X · Disclaimer · GitHub

---

## Pages

### 1. Home (`/`)

Long-scroll page. Each section corresponds to a nav tab in order, with abbreviated content and a "→ full page" link. Leaderboard is **not** on the home page.

**Sections (top to bottom):**

1. **Hero**
   - Horizontal banner image (full-width, max-height ~200px)
   - Headline: "Don't Find The Block. Make The List."
   - Subhead: "The Bitcoin Pool Where Finding The Block Doesn't Matter™"
   - BETA badge
   - Two CTA buttons: "Join Telegram" + "Follow on X"

2. **Pool Stats** (abbreviated — 4 key numbers)
   - Blocks Found · Active Miners (7d) · Slots Filled (X/21) · Est. BTC/Slot if Found Now
   - "→ Full stats" link to `/stats`

3. **How Each Block Pays Out**
   - Visual payout bar: Finder 2.1% (gold) · Pool Fee 2.1% (dark gold) · Top 21 Split 95.8% (gold/faded)
   - Prose: "Find the block. Get 2.1%. Make the list. Get paid."
   - Comparison table: Traditional Solo vs Unlucky21

4. **Quality Over Quantity**
   - Copy provided verbatim: "Only your single best share this round determines your rank..."

5. **Mine When You Want**
   - Copy provided verbatim: "Once you're in the Best 21 list, you're free to stop..."

6. **Connect** (abbreviated)
   - Three code boxes: Stratum URL · Username · Password
   - "→ Full connection guide with hardware examples" link to `/connect`

7. **Reward Rules** (abbreviated)
   - Two-sentence summary of rolling 7-day window, reset on block found
   - "→ Full reward rules" link to `/reward-rules`

8. **Community**
   - Telegram button + X button (larger, centered)

---

### 2. Stats (`/stats`)

Fetched server-side, 60-second cache for external calls.

**Pool stats (from DB):**
- Blocks Found
- Active Miners (7d)
- Accepted Shares (total)
- Best Share Ever (all-time max `share_difficulty`)
- Slots Filled (current leaderboard count / 21)
- Minimum Best Share to Enter Top 21 (21st-ranked miner's current best share, or "Any share" if < 21 miners)

**Network stats (from mempool.space signet API):**
- Network Hashrate — `GET https://mempool.space/signet/api/v1/mining/hashrate/1m`
- Current Difficulty — `GET https://mempool.space/signet/api/v1/difficulty-adjustment`

**BTC Price (from mempool.space mainnet API):**
- `GET https://mempool.space/api/v1/prices` — shows real BTC/USD value for context

**Pool Hashrate estimate:**
- Query: sum of `share_difficulty` for shares submitted in the last 10 minutes
- Formula: `pool_hashrate_hs = sum(share_difficulty) * 2^32 / 600`
- Displayed in H/s, KH/s, MH/s, TH/s depending on magnitude

**Expected time to find a block:**
- Formula: `expected_seconds = (network_difficulty * 2^32) / pool_hashrate_hs`
- Displayed as "~X days" or "~X hours"

**Probability breakdown (exponential distribution):**
- `P(t) = 1 - e^(-t / expected_seconds)`
- Show: Chance in 24h · Chance in 7 days · Chance in 30 days

All external fetches cached in-memory (Node.js module-level Map) with 60-second TTL. If external fetch fails, show "—" rather than erroring.

---

### 3. Connect (`/connect`)

**Pool connection details:**
```
Stratum URL:  stratum+tcp://bitcoin.unlucky21.com:3333
Username:     your_bitcoin_address.worker_name  (worker name optional)
Password:     x
```

**Hardware guides** (each as a collapsible or tabbed section):

- **Bitaxe** — Web UI settings screenshot description + field values (Host, Port, User, Pass)
- **Avalon Nano** — CGMiner-style config or web UI walkthrough
- **cpuminer** — Command-line example: `cpuminer -a sha256d -o stratum+tcp://bitcoin.unlucky21.com:3333 -u YOUR_BTC_ADDRESS -p x`

**Rental pool guides:**
- **Braiins Pool** — Hash marketplace → set destination pool to our stratum URL
- **NiceHash** — Hash power rental → custom pool configuration

Each section includes a note: "This is signet (testnet). Use a signet address, not a mainnet address."

---

### 4. Leaderboard (`/leaderboard`)

- Shows top 100 miners by best share (7-day rolling)
- Rows 1–21 highlighted with gold left border + faint gold row background
- Columns: Rank · Address (truncated, links to `/miner/[address]`) · Best Share · Last Active · Est. Payout (BTC)
- Empty slots (#X — "open slot") shown for ranks below current count, up to 21
- Banner above table: "Leaderboard resets to zero the moment Unlucky21 finds a block. Every slot opens."
- Note below table: "Rolling 7-day window — shares older than 7 days age out. Keep mining to hold your rank."
- Auto-refresh: `revalidate = 30` (Next.js ISR) or `force-dynamic` with client-side polling every 30s

---

### 5. Blocks (`/blocks`)

- Table of found blocks, newest first
- Columns: Height · Found At · Finder Address (truncated) · Fees (BTC) · Slots Filled
- Empty state: "No blocks found yet. Be the first."
- Each row links to a block detail page `/blocks/[height]` (stretch goal — can be deferred)

---

### 6. Reward Rules (`/reward-rules`)

Full written page. Sections:

1. **The Model** — Finder 2.1% · Pool Fee 2.1% · Top 21 Split 95.8%
2. **How Ranking Works** — Rolling 7-day best share; only one share per address counts (highest)
3. **The 7-Day Window** — Shares age out; stopping mining means your rank drops
4. **Leaderboard Reset** — Every slot clears the moment a block is found
5. **Soft Hashrate Cap** — Addresses with estimated 7-day hashrate > 100 TH/s are capped (cap increases by 100 TH/s per block found). Home miner badge (< 100 TH/s) shown on leaderboard.
6. **Payout Delivery** — Paid directly in the coinbase transaction; we never hold your BTC
7. **Example Calculation** — With a 3.125 BTC block reward + fees, show the exact split

---

### 7. My Stats (`/miner/[address]`)

Address lookup page. URL-based (`/miner/tb1q...`). Also accessible via search box at `/miner`.

Displays:
- Current rank (or "Not on leaderboard")
- Best share (7-day)
- Last active
- Estimated payout if a block were found now
- Share activity: table by hour, last 7 days (count + best share per hour bucket)
- Blocks appeared in: height, date, payout received

---

### 8. FAQ (`/faq`)

Q&A format. Questions derived from the copy provided:

- How is my rank determined?
- What happens if I stop mining?
- What happens when Unlucky21 finds a block?
- How do I receive my payout?
- Can I use a rental miner (NiceHash, Braiins)?
- What is the minimum hashrate to compete?
- Is there a fee?
- What is the 100 TH/s soft cap?
- How is the leaderboard reset?
- Is my Bitcoin address safe?

---

### 9. Transparency / Disclaimer (`/disclaimer`)

Full verbatim text as provided, organized under these headings:
- Software Bugs and Misconfigurations
- Orphaned Blocks
- Stale Shares
- Mistyped or Forgotten Bitcoin Addresses
- Being Pushed Out of Best 21
- Joining Best 21 Too Late
- Malicious Pool Operator
- Legal Risks
- Alternative Pools (ckpool, public-pool, atlaspool.io)

---

## New / Changed API Endpoints

| Endpoint | Change |
|---|---|
| `GET /api/stats` | Expand to include: pool hashrate estimate, min best share for Top 21, accepted shares total, best share all-time |
| `GET /api/external-stats` | New. Fetches BTC price + network hashrate + difficulty from mempool.space. 60s in-memory cache. |

---

## Logo / Image Assets

Place in `web/public/`:
- `logo.png` — circular badge (used in header nav and favicon)
- `banner.png` — horizontal "UNLUCKY21 SOLO POOL" banner (used in hero section)

User to supply image files; code references them as `/logo.png` and `/banner.png`. Until supplied, use text fallback.

---

## Out of Scope (this phase)

- Real-time WebSocket leaderboard updates (polling every 30s is sufficient)
- Block detail page `/blocks/[height]` (deferred)
- Email/notification system
- Admin dashboard
- Mainnet deployment config (separate task)
