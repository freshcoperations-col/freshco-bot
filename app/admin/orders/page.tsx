'use client'

import { useEffect, useState, useCallback } from 'react'
import { createBrowserClient } from '@/lib/supabase'

interface OrderItem {
  product_id?: string
  product_name?: string
  size?: string
  color?: string
  quantity?: number
  unit_price?: number
}

interface Order {
  id: string
  short_id: string
  customer_phone: string
  customer_name: string | null
  customer_email: string | null
  items: OrderItem[] | null
  total: number
  payment_status: string
  status: string
  paid_at: string | null
  tracking_number: string | null
  shipping_carrier: string | null
  shipped_at: string | null
  created_at: string
  shipping_address: string | null
  source: string
}

const CARRIERS = [
  'Servientrega',
  'Coordinadora',
  'Inter Rapidísimo',
  'Envia',
  '99 Minutos',
  'Otra',
]

const STATUS_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'pending', label: 'Pago pendiente', kind: 'payment' as const },
  { value: 'approved', label: 'Pagados', kind: 'payment' as const },
  { value: 'declined', label: 'Declinados', kind: 'payment' as const },
  { value: 'enviado', label: 'Enviados', kind: 'order' as const },
  { value: 'entregado', label: 'Entregados', kind: 'order' as const },
  { value: 'cancelado', label: 'Cancelados', kind: 'order' as const },
]

async function authHeader(): Promise<Record<string, string>> {
  const supabase = createBrowserClient()
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [search, setSearch] = useState('')
  const [shipping, setShipping] = useState<Order | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    const opt = STATUS_OPTIONS.find((o) => o.value === filter)
    if (opt?.kind === 'payment') params.set('payment_status', filter)
    if (opt?.kind === 'order') params.set('status', filter)
    if (search.trim()) params.set('search', search.trim())
    params.set('limit', '100')

    const headers = await authHeader()
    const res = await fetch(`/api/admin/web/orders?${params.toString()}`, {
      headers,
      cache: 'no-store',
    })
    if (res.ok) {
      const body = await res.json()
      setOrders(body.orders ?? [])
    } else {
      setOrders([])
    }
    setLoading(false)
  }, [filter, search])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold mb-1">Pedidos</h1>
      <p className="text-sm text-gray-500 mb-6">
        Lista de órdenes recientes. Marca como enviado para notificar al cliente por WhatsApp.
      </p>

      <div className="flex gap-3 mb-4 flex-wrap">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-300 rounded bg-white"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <input
          placeholder="Buscar por #ID, nombre, email o teléfono"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[280px] px-3 py-2 text-sm border border-gray-300 rounded bg-white"
        />
        <button
          onClick={load}
          className="px-4 py-2 text-xs uppercase tracking-wide bg-gray-900 text-white rounded"
        >
          Refrescar
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-2">Pedido</th>
              <th className="px-4 py-2">Cliente</th>
              <th className="px-4 py-2">Items</th>
              <th className="px-4 py-2">Total</th>
              <th className="px-4 py-2">Estado pago</th>
              <th className="px-4 py-2">Estado envío</th>
              <th className="px-4 py-2">Fecha</th>
              <th className="px-4 py-2 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                  Cargando…
                </td>
              </tr>
            ) : orders.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                  No hay pedidos para esos filtros.
                </td>
              </tr>
            ) : (
              orders.map((o) => (
                <tr key={o.id} className="border-t border-gray-100">
                  <td className="px-4 py-3 font-mono text-xs">#{o.short_id}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{o.customer_name ?? '—'}</div>
                    <div className="text-xs text-gray-500 truncate max-w-[180px]">
                      {o.customer_email ?? o.customer_phone}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {(o.items ?? [])
                      .map((it) => `${it.quantity ?? 1}× ${it.product_name ?? it.product_id}`)
                      .join(', ') || '—'}
                  </td>
                  <td className="px-4 py-3 font-medium">${Number(o.total).toLocaleString('es-CO')}</td>
                  <td className="px-4 py-3">
                    <PaymentBadge status={o.payment_status} />
                  </td>
                  <td className="px-4 py-3">
                    {o.tracking_number ? (
                      <div className="text-xs">
                        <div className="font-medium">{o.shipping_carrier}</div>
                        <div className="font-mono text-gray-500">{o.tracking_number}</div>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">{o.status ?? '—'}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {new Date(o.created_at).toLocaleDateString('es-CO')}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {o.payment_status === 'approved' && !o.tracking_number && (
                      <button
                        onClick={() => setShipping(o)}
                        className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                      >
                        Marcar enviado
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {shipping && (
        <ShipModal
          order={shipping}
          onClose={() => setShipping(null)}
          onDone={() => {
            setShipping(null)
            load()
          }}
        />
      )}
    </div>
  )
}

function PaymentBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: 'Pendiente', cls: 'bg-amber-100 text-amber-700' },
    approved: { label: 'Aprobado', cls: 'bg-green-100 text-green-700' },
    declined: { label: 'Declinado', cls: 'bg-red-100 text-red-700' },
    voided: { label: 'Anulado', cls: 'bg-gray-100 text-gray-700' },
    error: { label: 'Error', cls: 'bg-red-100 text-red-700' },
  }
  const v = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-700' }
  return (
    <span className={`px-2 py-1 text-xs rounded ${v.cls}`}>{v.label}</span>
  )
}

function ShipModal({
  order,
  onClose,
  onDone,
}: {
  order: Order
  onClose: () => void
  onDone: () => void
}) {
  const [carrier, setCarrier] = useState(CARRIERS[0])
  const [customCarrier, setCustomCarrier] = useState('')
  const [tracking, setTracking] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    const finalCarrier = carrier === 'Otra' ? customCarrier.trim() : carrier
    if (!finalCarrier || !tracking.trim()) {
      setError('Carrier y número de guía son requeridos.')
      return
    }
    setError(null)
    setSubmitting(true)

    const headers = { 'Content-Type': 'application/json', ...(await authHeader()) }
    const res = await fetch(`/api/admin/web/orders/${order.short_id}/ship`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        tracking_number: tracking.trim(),
        shipping_carrier: finalCarrier,
      }),
    })
    setSubmitting(false)
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(body.error || 'No se pudo marcar como enviado.')
      return
    }
    onDone()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold mb-1">Marcar como enviado</h2>
        <p className="text-xs text-gray-500 mb-4">
          Pedido #{order.short_id} · {order.customer_name ?? order.customer_phone}
        </p>

        <label className="block text-xs text-gray-600 mb-1">Transportadora</label>
        <select
          value={carrier}
          onChange={(e) => setCarrier(e.target.value)}
          className="w-full px-3 py-2 mb-3 text-sm border border-gray-300 rounded bg-white"
        >
          {CARRIERS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        {carrier === 'Otra' && (
          <input
            placeholder="Nombre de la transportadora"
            value={customCarrier}
            onChange={(e) => setCustomCarrier(e.target.value)}
            className="w-full px-3 py-2 mb-3 text-sm border border-gray-300 rounded"
          />
        )}

        <label className="block text-xs text-gray-600 mb-1">Número de guía</label>
        <input
          value={tracking}
          onChange={(e) => setTracking(e.target.value)}
          className="w-full px-3 py-2 mb-3 text-sm border border-gray-300 rounded font-mono"
          autoFocus
        />

        {error && <p className="text-xs text-red-600 mb-3">{error}</p>}

        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs uppercase tracking-wide text-gray-700 border border-gray-300 rounded"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-4 py-2 text-xs uppercase tracking-wide bg-blue-600 text-white rounded disabled:opacity-50"
          >
            {submitting ? 'Enviando…' : 'Marcar y notificar'}
          </button>
        </div>
      </div>
    </div>
  )
}
