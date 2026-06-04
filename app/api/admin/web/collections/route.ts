import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { verifyAdmin, bearerToken } from '@/lib/admin-auth'
import { adminCors } from '@/lib/admin-cors'

export const dynamic = 'force-dynamic'

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: adminCors(request.headers.get('origin')) })
}

// GET /api/admin/web/collections
export async function GET(request: NextRequest) {
  const cors = adminCors(request.headers.get('origin'))
  const admin = await verifyAdmin(bearerToken(request.headers.get('authorization')))
  if (!admin.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: cors })

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('collections')
    .select('id, label, description, image_url, sort_order, active, created_at')
    .order('sort_order', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: cors })
  return NextResponse.json({ collections: data ?? [] }, { headers: cors })
}

// POST /api/admin/web/collections
// Body: { id, label, description?, sort_order? }
export async function POST(request: NextRequest) {
  const cors = adminCors(request.headers.get('origin'))
  const admin = await verifyAdmin(bearerToken(request.headers.get('authorization')))
  if (!admin.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: cors })

  let body: Record<string, unknown>
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400, headers: cors })
  }

  const label = String(body.label ?? '').trim()
  if (!label) return NextResponse.json({ error: 'label es requerido' }, { status: 400, headers: cors })

  // Auto-generar slug si no se pasa id
  const id = body.id
    ? String(body.id).trim()
    : label.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('collections')
    .insert({
      id,
      label,
      description: body.description ? String(body.description) : null,
      sort_order: Number(body.sort_order ?? 0),
      active: true,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: cors })
  return NextResponse.json({ collection: data }, { status: 201, headers: cors })
}
