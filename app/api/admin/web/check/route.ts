import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin, bearerToken } from '@/lib/admin-auth'
import { adminCors } from '@/lib/admin-cors'

export const dynamic = 'force-dynamic'

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: adminCors(request.headers.get('origin')) })
}

// GET /api/admin/web/check
// El admin webapp lo llama al cargar para saber si la sesión actual es admin.
// Cliente debe pasar `Authorization: Bearer <access_token>`.
export async function GET(request: NextRequest) {
  const headers = adminCors(request.headers.get('origin'))
  const token = bearerToken(request.headers.get('authorization'))
  const result = await verifyAdmin(token)
  return NextResponse.json(result, { status: result.ok ? 200 : 403, headers })
}
