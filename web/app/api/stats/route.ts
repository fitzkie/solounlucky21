import { NextResponse } from 'next/server'
import { getPoolStats } from '@/lib/db'

export const revalidate = 60

export async function GET() {
  try {
    const stats = await getPoolStats()
    return NextResponse.json(stats)
  } catch (err) {
    console.error('stats API error:', err)
    return NextResponse.json({ error: 'Failed to load stats' }, { status: 500 })
  }
}
