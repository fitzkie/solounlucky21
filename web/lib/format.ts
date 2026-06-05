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
  if (secs < 0) return 'just now'
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
