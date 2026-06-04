import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// DELETE /api/conversations/[phone]
// Elimina todos los mensajes y la configuración de la conversación.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { phone: string } },
) {
  const supabase = createServerClient()

  const { error: msgError, count } = await supabase
    .from('messages')
    .delete({ count: 'exact' })
    .eq('customer_phone', params.phone)

  if (msgError) {
    return NextResponse.json({ error: msgError.message }, { status: 500 })
  }

  await supabase
    .from('conversation_settings')
    .delete()
    .eq('customer_phone', params.phone)

  return NextResponse.json(
    { ok: true, deleted: count ?? 0 },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  )
}
