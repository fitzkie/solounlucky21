import { NextResponse } from 'next/server'
import { getExternalStats } from '@/lib/external'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const stats = await getExternalStats()
    return NextResponse.json(stats)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('external-stats API error:', msg)
    return NextResponse.json({ error: 'Failed to load external stats', detail: msg }, { status: 500 })
  }
}
