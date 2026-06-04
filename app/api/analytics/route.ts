import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GET /api/analytics — datos agregados de ventas para el dashboard.
export async function GET() {
  const supabase = createServerClient()

  const { data: orders, error } = await supabase
    .from('orders')
    .select('id, total, status, payment_status, items, created_at, customer_phone, source')
    .order('created_at', { ascending: false })
    .limit(1000)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = orders ?? []

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const approved = rows.filter((o) => o.payment_status === 'approved')
  const totalRevenue = approved.reduce((s, o) => s + (Number(o.total) || 0), 0)
  const avgOrderValue = approved.length > 0 ? totalRevenue / approved.length : 0

  const byPaymentStatus: Record<string, number> = {}
  for (const o of rows) {
    byPaymentStatus[o.payment_status] = (byPaymentStatus[o.payment_status] ?? 0) + 1
  }

  const byOrderStatus: Record<string, number> = {}
  for (const o of rows) {
    const s = o.status ?? 'pending'
    byOrderStatus[s] = (byOrderStatus[s] ?? 0) + 1
  }

  const bySource: Record<string, number> = {}
  for (const o of rows) {
    const s = o.source ?? 'whatsapp_bot'
    bySource[s] = (bySource[s] ?? 0) + 1
  }

  // ── Top productos ─────────────────────────────────────────────────────────
  const productUnits: Record<string, { name: string; units: number; revenue: number }> = {}
  for (const o of approved) {
    const items = (o.items ?? []) as Array<{
      product_id?: string
      product_name?: string
      quantity?: number
      unit_price?: number
    }>
    for (const item of items) {
      if (!item.product_id) continue
      const key = item.product_id
      if (!productUnits[key]) {
        productUnits[key] = { name: item.product_name ?? key, units: 0, revenue: 0 }
      }
      const qty = Number(item.quantity) || 1
      productUnits[key].units += qty
      productUnits[key].revenue += qty * (Number(item.unit_price) || 0)
    }
  }
  const topProducts = Object.entries(productUnits)
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, 5)
    .map(([id, v]) => ({ id, ...v }))

  // ── Ventas por día (últimos 30 días) ──────────────────────────────────────
  const now = new Date()
  const dailyRevenue: Record<string, number> = {}
  const dailyOrders: Record<string, number> = {}

  for (let i = 29; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    dailyRevenue[key] = 0
    dailyOrders[key] = 0
  }

  for (const o of approved) {
    const day = (o.created_at as string).slice(0, 10)
    if (day in dailyRevenue) {
      dailyRevenue[day] += Number(o.total) || 0
      dailyOrders[day] += 1
    }
  }

  const dailySeries = Object.entries(dailyRevenue).map(([date, revenue]) => ({
    date,
    revenue,
    orders: dailyOrders[date] ?? 0,
  }))

  // ── Clientes únicos ───────────────────────────────────────────────────────
  const uniqueCustomers = new Set(rows.map((o) => o.customer_phone)).size
  const returningCustomers = new Set(
    Object.entries(
      rows.reduce<Record<string, number>>((acc, o) => {
        acc[o.customer_phone] = (acc[o.customer_phone] ?? 0) + 1
        return acc
      }, {}),
    )
      .filter(([, count]) => count > 1)
      .map(([phone]) => phone),
  ).size

  return NextResponse.json(
    {
      kpis: {
        total_revenue: totalRevenue,
        total_orders: rows.length,
        approved_orders: approved.length,
        avg_order_value: avgOrderValue,
        unique_customers: uniqueCustomers,
        returning_customers: returningCustomers,
      },
      by_payment_status: byPaymentStatus,
      by_order_status: byOrderStatus,
      by_source: bySource,
      top_products: topProducts,
      daily_series: dailySeries,
    },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  )
}
