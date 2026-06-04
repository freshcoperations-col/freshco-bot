import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { verifyAdmin, bearerToken } from '@/lib/admin-auth'
import { adminCors } from '@/lib/admin-cors'

export const dynamic = 'force-dynamic'

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: adminCors(request.headers.get('origin')) })
}

// DELETE /api/admin/web/conversations/[phone]/delete
// Elimina todos los mensajes de una conversación. No borra las órdenes.
export async function DELETE(
  request: NextRequest,
  { params }: { params: { phone: string } },
) {
  const cors = adminCors(request.headers.get('origin'))
  const admin = await verifyAdmin(bearerToken(request.headers.get('authorization')))
  if (!admin.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: cors })

  const supabase = createServerClient()
  const { error, count } = await supabase
    .from('messages')
    .delete({ count: 'exact' })
    .eq('customer_phone', params.phone)

  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: cors })

  return NextResponse.json({ ok: true, deleted: count ?? 0 }, { headers: cors })
}
