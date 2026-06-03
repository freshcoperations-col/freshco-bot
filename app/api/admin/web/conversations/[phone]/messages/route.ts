import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { verifyAdmin, bearerToken } from '@/lib/admin-auth'
import { adminCors } from '@/lib/admin-cors'

export const dynamic = 'force-dynamic'

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: adminCors(request.headers.get('origin')) })
}

// GET /api/admin/web/conversations/[phone]/messages — mensajes de una conversación.
export async function GET(
  request: NextRequest,
  { params }: { params: { phone: string } },
) {
  const cors = adminCors(request.headers.get('origin'))
  const admin = await verifyAdmin(bearerToken(request.headers.get('authorization')))
  if (!admin.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: cors })

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('customer_phone', params.phone)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: cors })

  return NextResponse.json({ messages: data ?? [] }, { headers: cors })
}
