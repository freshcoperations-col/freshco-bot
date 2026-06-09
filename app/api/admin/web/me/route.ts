import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin, bearerToken } from '@/lib/admin-auth'
import { adminCors } from '@/lib/admin-cors'

export const dynamic = 'force-dynamic'

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: adminCors(request.headers.get('origin')) })
}

// GET /api/admin/web/me — devuelve el email, rol y permisos del usuario autenticado
export async function GET(request: NextRequest) {
  const cors = adminCors(request.headers.get('origin'))
  const admin = await verifyAdmin(bearerToken(request.headers.get('authorization')))
  if (!admin.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: cors })

  return NextResponse.json({
    email: admin.email,
    role: admin.role,
    permissions: admin.permissions,
    isOwner: admin.isOwner,
  }, { headers: cors })
}
