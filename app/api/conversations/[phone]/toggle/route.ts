import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, isAIPaused, setAIPaused } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// PUT /api/conversations/[phone]/toggle — alterna modo manual/AI
export async function PUT(
  _request: NextRequest,
  { params }: { params: { phone: string } },
) {
  const phone = params.phone

  if (!phone) {
    return NextResponse.json({ error: 'Phone requerido' }, { status: 400 })
  }

  try {
    const supabase = createServerClient()
    const currentlyPaused = await isAIPaused(supabase, phone)
    const newState = !currentlyPaused
    await setAIPaused(supabase, phone, newState)
    return NextResponse.json({ ai_paused: newState })
  } catch (error) {
    console.error('Error toggling AI:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

// GET /api/conversations/[phone]/toggle — obtiene estado actual
export async function GET(
  _request: NextRequest,
  { params }: { params: { phone: string } },
) {
  const phone = params.phone

  if (!phone) {
    return NextResponse.json({ error: 'Phone requerido' }, { status: 400 })
  }

  try {
    const supabase = createServerClient()
    const paused = await isAIPaused(supabase, phone)
    return NextResponse.json({ ai_paused: paused })
  } catch (error) {
    console.error('Error obteniendo estado AI:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
