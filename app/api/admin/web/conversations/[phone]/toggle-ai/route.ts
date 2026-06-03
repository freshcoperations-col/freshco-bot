import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, setAIPaused } from '@/lib/supabase'
import { verifyAdmin, bearerToken } from '@/lib/admin-auth'
import { adminCors } from '@/lib/admin-cors'

export const dynamic = 'force-dynamic'

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: adminCors(request.headers.get('origin')) })
}

// POST /api/admin/web/conversations/[phone]/toggle-ai
// Body: { paused: boolean }
export async function POST(
  request: NextRequest,
  { params }: { params: { phone: string } },
) {
  const cors = adminCors(request.headers.get('origin'))
  const admin = await verifyAdmin(bearerToken(request.headers.get('authorization')))
  if (!admin.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: cors })

  let body: { paused?: boolean }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400, headers: cors })
  }

  const supabase = createServerClient()
  await setAIPaused(supabase, params.phone, Boolean(body.paused))

  return NextResponse.json({ ok: true, ai_paused: Boolean(body.paused) }, { headers: cors })
}
