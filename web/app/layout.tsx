import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Unlucky21 — Bitcoin Solo Mining Pool',
  description: "Don't find the block. Make the list.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-black text-white antialiased">
        <header className="border-b border-white/10 px-6 py-4">
          <div className="max-w-5xl mx-auto flex items-center justify-between">
            <div>
              <span className="text-xl font-bold tracking-tight">Unlucky21</span>
              <span className="ml-3 text-sm text-white/40">Bitcoin Solo Mining Pool</span>
            </div>
            <nav className="flex gap-6 text-sm text-white/60">
              <a href="/" className="hover:text-white transition-colors">Leaderboard</a>
              <a href="/blocks" className="hover:text-white transition-colors">Blocks</a>
            </nav>
          </div>
        </header>
        <main className="max-w-5xl mx-auto px-6 py-8">
          {children}
        </main>
        <footer className="border-t border-white/10 px-6 py-6 mt-12">
          <div className="max-w-5xl mx-auto text-center text-sm text-white/30">
            stratum+tcp://bitcoin.unlucky21.com:3333 &nbsp;·&nbsp;
            <a href="https://github.com/fitzkie/unlucky21" className="hover:text-white/60 transition-colors">
              GitHub
            </a>
          </div>
        </footer>
      </body>
    </html>
  )
}
