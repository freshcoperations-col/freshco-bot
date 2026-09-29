import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { verifyAdmin, bearerToken } from '@/lib/admin-auth'
import { adminCors } from '@/lib/admin-cors'
import { FIELDS, ID_HEADER, SELECT_COLUMNS, formatCell, loadReference } from '@/lib/product-fields'

export const dynamic = 'force-dynamic'

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: adminCors(request.headers.get('origin')) })
}

// Punto y coma: es el separador que Excel usa en español (Colombia usa la
// coma como decimal). Con coma, un doble clic abre todo en una sola columna.
const SEP = ';'

function csvCell(value: string): string {
  return /[;"\r\n]|^\s|\s$/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

// GET /api/admin/web/products/export — el catálogo como CSV, listo para
// editar en Excel o Google Sheets y volver a subir en "Importar CSV".
export async function GET(request: NextRequest) {
  const cors = adminCors(request.headers.get('origin'))
  const admin = await verifyAdmin(bearerToken(request.headers.get('authorization')))
  if (!admin.ok || !admin.permissions.products_view) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: cors })
  }

  const supabase = createServerClient()
  const [ref, { data: products, error }] = await Promise.all([
    loadReference(supabase),
    supabase.from('products').select(SELECT_COLUMNS).order('name'),
  ])
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: cors })

  // tipo_prenda y stock van como contexto; la importación los ignora.
  const header = [ID_HEADER, 'tipo_prenda', ...FIELDS.map((f) => f.header), 'stock']
  const lines = [header.join(SEP)]

  for (const p of (products ?? []) as unknown as Record<string, unknown>[]) {
    const row = [
      String(p.id),
      String(p.garment_type ?? ''),
      ...FIELDS.map((f) => formatCell(f, p[f.key], ref)),
      String(p.stock ?? ''),
    ]
    lines.push(row.map(csvCell).join(SEP))
  }

  // La marca UTF-8 (BOM) es lo que hace que Excel lea bien tildes y ñ.
  const csv = '\uFEFF' + lines.join('\r\n') + '\r\n'
  const fecha = new Date().toISOString().slice(0, 10)

  return new NextResponse(csv, {
    headers: {
      ...cors,
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="catalogo-freshco-${fecha}.csv"`,
    },
  })
}
