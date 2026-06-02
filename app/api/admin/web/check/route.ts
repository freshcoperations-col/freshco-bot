import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin, bearerToken } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

// GET /api/admin/web/check
// El admin webapp lo llama al cargar para saber si la sesión actual es admin.
// Cliente debe pasar `Authorization: Bearer <access_token>`.
export async function GET(request: NextRequest) {
  const token = bearerToken(request.headers.get('authorization'))
  const result = await verifyAdmin(token)
  return NextResponse.json(result, {
    status: result.ok ? 200 : 403,
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  })
}
