import { NextRequest, NextResponse } from 'next/server'
import { getBlocks } from '@/lib/db'

export const revalidate = 60

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const page   = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const limit  = 20
  const offset = (page - 1) * limit

  try {
    const blocks = await getBlocks(limit, offset)
    return NextResponse.json({ blocks, page })
  } catch (err) {
    console.error('blocks API error:', err)
    return NextResponse.json({ error: 'Failed to load blocks' }, { status: 500 })
  }
}
