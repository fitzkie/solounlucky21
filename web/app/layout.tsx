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
              <img src="/logo.png" alt="Unlucky21" className="w-10 h-10 rounded-full" />
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
