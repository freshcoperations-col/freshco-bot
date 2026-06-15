import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin, bearerToken } from '@/lib/admin-auth'
import { adminCors } from '@/lib/admin-cors'
import { ga4Configured, getGaClient, gaPropertyId } from '@/lib/ga4'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: adminCors(request.headers.get('origin')) })
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

const num = (v?: string | null) => Number(v ?? 0)

const CHANNEL_LABELS: Record<string, string> = {
  'Direct': 'Directo',
  'Organic Search': 'Búsqueda orgánica',
  'Paid Search': 'Búsqueda pagada',
  'Organic Social': 'Redes sociales',
  'Paid Social': 'Redes (pago)',
  'Referral': 'Referidos',
  'Email': 'Email',
  'Unassigned': 'Sin asignar',
  'Direct Traffic': 'Directo',
}

// GET /api/admin/web/ga-overview?days=30
// Trae métricas de tráfico desde Google Analytics 4 (GA4 Data API).
export async function GET(request: NextRequest) {
  const cors = adminCors(request.headers.get('origin'))
  const admin = await verifyAdmin(bearerToken(request.headers.get('authorization')))
  if (!admin.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: cors })

  if (!ga4Configured()) {
    return NextResponse.json(
      { error: 'Google Analytics no está configurado (faltan variables de entorno GA4_PROPERTY_ID, GA4_CLIENT_EMAIL, GA4_PRIVATE_KEY)' },
      { status: 501, headers: cors },
    )
  }

  const days = Number(request.nextUrl.searchParams.get('days') || '30')
  const property = gaPropertyId()
  const client = getGaClient()

  // GA tarda en consolidar el día en curso, así que el rango termina ayer.
  const end = new Date()
  end.setDate(end.getDate() - 1)
  const start = new Date(end)
  start.setDate(start.getDate() - (days - 1))
  const prevEnd = new Date(start)
  prevEnd.setDate(prevEnd.getDate() - 1)
  const prevStart = new Date(prevEnd)
  prevStart.setDate(prevStart.getDate() - (days - 1))

  const startDate = fmtDate(start)
  const endDate = fmtDate(end)
  const prevStartDate = fmtDate(prevStart)
  const prevEndDate = fmtDate(prevEnd)

  const overviewMetrics = [
    { name: 'activeUsers' },
    { name: 'newUsers' },
    { name: 'sessions' },
    { name: 'screenPageViews' },
    { name: 'averageSessionDuration' },
    { name: 'bounceRate' },
  ]

  try {
    const [[batch], realtime] = await Promise.all([
      client.batchRunReports({
        property,
        requests: [
          { dateRanges: [{ startDate, endDate }], metrics: overviewMetrics },
          { dateRanges: [{ startDate: prevStartDate, endDate: prevEndDate }], metrics: overviewMetrics },
          {
            dateRanges: [{ startDate, endDate }],
            dimensions: [{ name: 'date' }],
            metrics: [{ name: 'activeUsers' }, { name: 'sessions' }, { name: 'screenPageViews' }],
            orderBys: [{ dimension: { dimensionName: 'date' } }],
          },
          {
            dateRanges: [{ startDate, endDate }],
            dimensions: [{ name: 'pagePathPlusQueryString' }],
            metrics: [{ name: 'screenPageViews' }, { name: 'activeUsers' }],
            orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
          },
          {
            dateRanges: [{ startDate, endDate }],
            dimensions: [{ name: 'sessionDefaultChannelGroup' }],
            metrics: [{ name: 'sessions' }, { name: 'activeUsers' }],
            orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
          },
          {
            dateRanges: [{ startDate, endDate }],
            dimensions: [{ name: 'deviceCategory' }],
            metrics: [{ name: 'sessions' }],
            orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
          },
          {
            dateRanges: [{ startDate, endDate }],
            dimensions: [{ name: 'country' }],
            metrics: [{ name: 'activeUsers' }],
            orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }],
          },
        ],
      }),
      client.runRealtimeReport({ property, metrics: [{ name: 'activeUsers' }] }).catch(() => null),
    ])

    const reports = batch.reports ?? []

    const overviewFrom = (report: (typeof reports)[number] | undefined) => {
      const vals = report?.rows?.[0]?.metricValues ?? []
      return {
        active_users: num(vals[0]?.value),
        new_users: num(vals[1]?.value),
        sessions: num(vals[2]?.value),
        page_views: num(vals[3]?.value),
        avg_session_duration: num(vals[4]?.value),
        bounce_rate: num(vals[5]?.value),
      }
    }

    const current = overviewFrom(reports[0])
    const previous = overviewFrom(reports[1])

    const daily_series = (reports[2]?.rows ?? []).map((r) => {
      const d = r.dimensionValues?.[0]?.value ?? ''
      return {
        date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`,
        active_users: num(r.metricValues?.[0]?.value),
        sessions: num(r.metricValues?.[1]?.value),
        page_views: num(r.metricValues?.[2]?.value),
      }
    })

    const top_pages = (reports[3]?.rows ?? []).slice(0, 10).map((r) => ({
      path: r.dimensionValues?.[0]?.value || '/',
      page_views: num(r.metricValues?.[0]?.value),
      active_users: num(r.metricValues?.[1]?.value),
    }))

    const traffic_sources = (reports[4]?.rows ?? []).map((r) => {
      const name = r.dimensionValues?.[0]?.value ?? ''
      return {
        channel: CHANNEL_LABELS[name] ?? name,
        sessions: num(r.metricValues?.[0]?.value),
        active_users: num(r.metricValues?.[1]?.value),
      }
    })

    const devices = (reports[5]?.rows ?? []).map((r) => ({
      device: r.dimensionValues?.[0]?.value ?? '',
      sessions: num(r.metricValues?.[0]?.value),
    }))

    const countries = (reports[6]?.rows ?? []).slice(0, 8).map((r) => ({
      country: r.dimensionValues?.[0]?.value ?? '',
      active_users: num(r.metricValues?.[0]?.value),
    }))

    const realtime_active_users = num(realtime?.[0]?.rows?.[0]?.metricValues?.[0]?.value)

    return NextResponse.json(
      {
        range: { start: startDate, end: endDate, days },
        current,
        previous,
        realtime_active_users,
        daily_series,
        top_pages,
        traffic_sources,
        devices,
        countries,
      },
      { headers: cors },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: `Error al consultar Google Analytics: ${message}` }, { status: 500, headers: cors })
  }
}
