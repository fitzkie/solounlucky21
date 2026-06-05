import { NextResponse } from 'next/server'
import { getExtendedPoolStats } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const stats = await getExtendedPoolStats()
    return NextResponse.json(stats)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('stats API error:', msg)
    return NextResponse.json({ error: 'Failed to load stats', detail: msg }, { status: 500 })
  }
}
