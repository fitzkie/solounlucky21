import { NextRequest, NextResponse } from 'next/server'
import { getMinerStats } from '@/lib/db'

export const revalidate = 30

export async function GET(
  _req: NextRequest,
  { params }: { params: { address: string } }
) {
  const { address } = params

  if (!address || address.length < 10) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 })
  }

  try {
    const stats = await getMinerStats(address)
    return NextResponse.json(stats)
  } catch (err) {
    console.error('miner API error:', err)
    return NextResponse.json({ error: 'Failed to load miner stats' }, { status: 500 })
  }
}
