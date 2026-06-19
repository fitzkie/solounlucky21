import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Unlucky21 — Bitcoin Solo Mining Pool',
  description: "Don't find the block. Make the list.",
}

const NAV_LINKS = [
  { href: '/stats',        label: 'Stats' },
  { href: '/join',         label: 'Join' },
  { href: '/leaderboard',  label: 'Leaderboard' },
  { href: '/reward-rules', label: 'Reward Rules' },
  { href: '/miner',        label: 'My Stats' },
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
            <div className="flex items-center gap-1 shrink-0 ml-1">
              <a
                href="https://t.me/unlucky21solopool"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Telegram"
                className="p-1.5 rounded text-white/40 hover:text-[#229ED9] hover:bg-white/5 transition-colors"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                  <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
                </svg>
              </a>
              <a
                href="https://x.com/unlucky21pool"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Follow on X"
                className="p-1.5 rounded text-white/40 hover:text-white hover:bg-white/5 transition-colors"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.259 5.63L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z"/>
                </svg>
              </a>
            </div>
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
              <a href="/faq" className="hover:text-white/60 transition-colors">FAQ</a>
              <a href="/disclaimer" className="hover:text-white/60 transition-colors">Disclaimer</a>
              <a href="https://github.com/fitzkie/unlucky21" target="_blank" rel="noopener noreferrer" className="hover:text-white/60 transition-colors">GitHub</a>
            </div>
          </div>
        </footer>
      </body>
    </html>
  )
}
