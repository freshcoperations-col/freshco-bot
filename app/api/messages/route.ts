import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

// GET /api/messages?phone=xxx — mensajes de un cliente específico
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const phone = searchParams.get('phone')

  if (!phone) {
    return NextResponse.json({ error: 'Parámetro phone requerido' }, { status: 400 })
  }

  try {
    const supabase = createServerClient()

    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('customer_phone', phone)
      .order('created_at', { ascending: true })

    if (error) throw error

    return NextResponse.json(data ?? [])
  } catch (error) {
    console.error('Error obteniendo mensajes:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
