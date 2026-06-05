import { NextResponse } from 'next/server'
import { getLeaderboard } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const entries = await getLeaderboard()
    return NextResponse.json({ entries, updatedAt: new Date().toISOString() })
  } catch (err) {
    console.error('leaderboard API error:', err)
    return NextResponse.json({ error: 'Failed to load leaderboard' }, { status: 500 })
  }
}
