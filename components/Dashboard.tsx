'use client'

import { useState, useEffect, useCallback } from 'react'
import { formatDistanceToNow, format } from 'date-fns'
import { es } from 'date-fns/locale'
import { ConversationList } from './ConversationList'
import { ChatView } from './ChatView'
import { createBrowserClient } from '@/lib/supabase'
import { INTENT_COLORS, INTENT_LABELS, type Intent } from '@/lib/intents'
import type { Message, Conversation } from '@/lib/supabase'

// ─── Tipos locales ────────────────────────────────────────────────────────────

interface OrderRow {
  id: string
  short_id: string
  total: number
  status: string
  payment_status: string
  created_at: string
  items: { product_name: string; size: string; quantity: number }[]
}

interface ProductRow {
  id: string
  name: string
  garment_type_label: string | null
  price: number
  stock: number
  available: boolean
  out_of_stock: boolean
  featured: boolean
  on_sale: boolean
}

interface CouponRow {
  id: string
  code: string
  discount: number
  description: string | null
  active: boolean
  usage_limit: number | null
  used_count: number
  expires_at: string | null
  created_at: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending:    { label: 'Pendiente',   color: 'bg-yellow-100 text-yellow-700' },
  enviado:    { label: 'En camino',   color: 'bg-blue-100 text-blue-700' },
  entregado:  { label: 'Entregado',   color: 'bg-green-100 text-green-700' },
  cancelled:  { label: 'Cancelado',   color: 'bg-gray-100 text-gray-500' },
}

const PAYMENT_LABELS: Record<string, string> = {
  approved: '✓ Pagado',
  pending:  '⏳ Pendiente',
  declined: '✗ Declinado',
  voided:   '✗ Anulado',
  error:    '✗ Error',
}

function formatCOP(n: number) {
  return '$' + n.toLocaleString('es-CO')
}

// ─── Sección pedidos (dentro de CustomerDetail) ───────────────────────────────

function OrdersSection({ phone }: { phone: string }) {
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [confirmUndeliver, setConfirmUndeliver] = useState<string | null>(null)
  const [undeliverReason, setUndeliverReason] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/orders?phone=${encodeURIComponent(phone)}`, { cache: 'no-store' })
      if (res.ok) setOrders(await res.json())
    } finally {
      setLoading(false)
    }
  }, [phone])

  useEffect(() => { load() }, [load])

  async function handleDelete(shortId: string) {
    setBusy(shortId)
    try {
      await fetch(`/api/orders/${shortId}`, { method: 'DELETE' })
      setOrders((prev) => prev.filter((o) => o.short_id !== shortId))
    } finally {
      setBusy(null)
      setConfirmDelete(null)
    }
  }

  async function handleUndeliver(shortId: string) {
    setBusy(shortId)
    try {
      const res = await fetch(`/api/orders/${shortId}/undeliver`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: undeliverReason }),
      })
      if (res.ok) {
        setOrders((prev) =>
          prev.map((o) => (o.short_id === shortId ? { ...o, status: 'enviado' } : o)),
        )
      }
    } finally {
      setBusy(null)
      setConfirmUndeliver(null)
      setUndeliverReason('')
    }
  }

  if (loading) {
    return <div className="text-xs text-gray-400 py-2">Cargando pedidos...</div>
  }

  if (orders.length === 0) {
    return <div className="text-xs text-gray-400 py-2">Sin pedidos registrados</div>
  }

  return (
    <div className="space-y-2">
      {orders.map((order) => {
        const statusInfo = STATUS_LABELS[order.status] ?? { label: order.status, color: 'bg-gray-100 text-gray-500' }
        const isConfirmingDelete = confirmDelete === order.short_id
        const isConfirmingUndeliver = confirmUndeliver === order.short_id
        const isBusy = busy === order.short_id

        return (
          <div key={order.id} className="border border-gray-200 rounded p-2 text-xs bg-white">
            <div className="flex items-center justify-between mb-1">
              <span className="font-mono font-semibold text-gray-800">#{order.short_id}</span>
              <div className="flex items-center gap-1">
                <span className={`px-1.5 py-0.5 rounded-sm text-xs font-medium ${statusInfo.color}`}>
                  {statusInfo.label}
                </span>
                <span className="text-gray-400 text-xs">{PAYMENT_LABELS[order.payment_status] ?? order.payment_status}</span>
              </div>
            </div>
            <div className="text-gray-600 mb-1">
              {formatCOP(order.total)} · {format(new Date(order.created_at), "d MMM yyyy", { locale: es })}
            </div>

            {/* Acciones */}
            {isConfirmingDelete ? (
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-gray-500">¿Eliminar pedido?</span>
                <button
                  onClick={() => handleDelete(order.short_id)}
                  disabled={isBusy}
                  className="px-2 py-0.5 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                >
                  {isBusy ? '...' : 'Sí'}
                </button>
                <button
                  onClick={() => setConfirmDelete(null)}
                  className="px-2 py-0.5 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                >
                  No
                </button>
              </div>
            ) : isConfirmingUndeliver ? (
              <div className="mt-1 space-y-1">
                <input
                  type="text"
                  placeholder="Razón (opcional)"
                  value={undeliverReason}
                  onChange={(e) => setUndeliverReason(e.target.value)}
                  className="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-500"
                />
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleUndeliver(order.short_id)}
                    disabled={isBusy}
                    className="px-2 py-0.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                  >
                    {isBusy ? '...' : 'Revertir y notificar'}
                  </button>
                  <button
                    onClick={() => { setConfirmUndeliver(null); setUndeliverReason('') }}
                    className="px-2 py-0.5 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 mt-1">
                {order.status === 'entregado' && (
                  <button
                    onClick={() => setConfirmUndeliver(order.short_id)}
                    className="px-2 py-0.5 bg-orange-50 border border-orange-300 text-orange-700 rounded hover:bg-orange-100"
                  >
                    Revertir a en camino
                  </button>
                )}
                <button
                  onClick={() => setConfirmDelete(order.short_id)}
                  className="px-2 py-0.5 bg-gray-50 border border-gray-300 text-gray-600 rounded hover:bg-red-50 hover:border-red-300 hover:text-red-600"
                >
                  Eliminar
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Panel de productos ───────────────────────────────────────────────────────

function ProductosView() {
  const [products, setProducts] = useState<ProductRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/products', { cache: 'no-store' })
      if (res.ok) setProducts(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function toggle(id: string, field: 'available' | 'out_of_stock', newVal: boolean) {
    setBusy(`${id}-${field}`)
    try {
      await fetch(`/api/products/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: newVal }),
      })
      setProducts((prev) =>
        prev.map((p) => (p.id === id ? { ...p, [field]: newVal } : p)),
      )
    } finally {
      setBusy(null)
    }
  }

  async function handleDelete(id: string) {
    setBusy(`${id}-delete`)
    try {
      await fetch(`/api/products/${encodeURIComponent(id)}`, { method: 'DELETE' })
      setProducts((prev) => prev.filter((p) => p.id !== id))
    } finally {
      setBusy(null)
      setConfirmDelete(null)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-900">Productos</h2>
          <button
            onClick={load}
            className="text-xs text-gray-500 hover:text-gray-800 px-2 py-1 border border-gray-300 rounded hover:bg-gray-50"
          >
            Actualizar
          </button>
        </div>

        {loading ? (
          <div className="text-sm text-gray-400">Cargando productos...</div>
        ) : products.length === 0 ? (
          <div className="text-sm text-gray-400">Sin productos.</div>
        ) : (
          <div className="border border-gray-200 rounded overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Producto</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Tipo</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Stock</th>
                  <th className="text-center px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Visibilidad</th>
                  <th className="text-center px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Disponibilidad</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {products.map((product) => {
                  const isOculto = !product.available
                  const isAgotado = product.out_of_stock || product.stock === 0
                  const busyOcultar = busy === `${product.id}-available`
                  const busyAgotado = busy === `${product.id}-out_of_stock`
                  const busyDelete = busy === `${product.id}-delete`
                  const isConfirmingDelete = confirmDelete === product.id

                  return (
                    <tr
                      key={product.id}
                      className={`bg-white hover:bg-gray-50 ${isOculto ? 'opacity-50' : ''}`}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{product.name}</div>
                        <div className="font-mono text-xs text-gray-400">{product.id}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{product.garment_type_label ?? '—'}</td>
                      <td className="px-4 py-3 text-right font-mono text-gray-700">
                        <span className={product.stock === 0 ? 'text-red-500 font-semibold' : ''}>
                          {product.stock}
                        </span>
                      </td>

                      {/* Visibilidad: Ocultar / Mostrar */}
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => toggle(product.id, 'available', isOculto)}
                          disabled={busyOcultar}
                          className={`text-xs px-3 py-1 rounded border transition-colors disabled:opacity-50 ${
                            isOculto
                              ? 'bg-gray-100 border-gray-300 text-gray-600 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700'
                              : 'bg-green-50 border-green-300 text-green-700 hover:bg-orange-50 hover:border-orange-300 hover:text-orange-700'
                          }`}
                        >
                          {busyOcultar ? '...' : isOculto ? 'Mostrar' : 'Ocultar'}
                        </button>
                      </td>

                      {/* Disponibilidad: Agotado / Disponible */}
                      <td className="px-4 py-3 text-center">
                        {product.stock === 0 && !product.out_of_stock ? (
                          <span className="text-xs px-3 py-1 rounded bg-red-50 border border-red-200 text-red-600">
                            Agotado (stock 0)
                          </span>
                        ) : (
                          <button
                            onClick={() => toggle(product.id, 'out_of_stock', !product.out_of_stock)}
                            disabled={busyAgotado || product.stock === 0}
                            className={`text-xs px-3 py-1 rounded border transition-colors disabled:opacity-40 ${
                              product.out_of_stock
                                ? 'bg-red-50 border-red-300 text-red-700 hover:bg-green-50 hover:border-green-300 hover:text-green-700'
                                : 'bg-green-50 border-green-300 text-green-700 hover:bg-red-50 hover:border-red-300 hover:text-red-700'
                            }`}
                          >
                            {busyAgotado ? '...' : product.out_of_stock ? 'Disponible' : 'Agotado'}
                          </button>
                        )}
                      </td>

                      {/* Eliminar */}
                      <td className="px-4 py-3 text-center">
                        {isConfirmingDelete ? (
                          <div className="flex items-center gap-1.5 justify-center">
                            <span className="text-xs text-gray-500">¿Eliminar?</span>
                            <button
                              onClick={() => handleDelete(product.id)}
                              disabled={busyDelete}
                              className="text-xs px-2 py-0.5 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                            >
                              {busyDelete ? '...' : 'Sí'}
                            </button>
                            <button
                              onClick={() => setConfirmDelete(null)}
                              className="text-xs px-2 py-0.5 bg-gray-200 text-gray-700 rounded"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDelete(product.id)}
                            className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                            title="Eliminar producto"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-gray-400 mt-3">
          <strong>Ocultar</strong>: el producto desaparece de la página web. <strong>Agotado</strong>: sigue visible pero con badge &ldquo;AGOTADO&rdquo; y sin botón de compra.
        </p>
      </div>
    </div>
  )
}

// ─── Panel de cupones ─────────────────────────────────────────────────────────

function CouponesView() {
  const [coupons, setCoupons] = useState<CouponRow[]>([])
  const [loading, setLoading] = useState(true)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/coupons', { cache: 'no-store' })
      if (res.ok) setCoupons(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleDelete(id: string) {
    setBusy(id)
    try {
      await fetch(`/api/coupons/${id}`, { method: 'DELETE' })
      setCoupons((prev) => prev.filter((c) => c.id !== id))
    } finally {
      setBusy(null)
      setConfirmDelete(null)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-900">Cupones de descuento</h2>
          <button
            onClick={load}
            className="text-xs text-gray-500 hover:text-gray-800 px-2 py-1 border border-gray-300 rounded hover:bg-gray-50"
          >
            Actualizar
          </button>
        </div>

        {loading ? (
          <div className="text-sm text-gray-400">Cargando cupones...</div>
        ) : coupons.length === 0 ? (
          <div className="text-sm text-gray-400">Sin cupones registrados.</div>
        ) : (
          <div className="border border-gray-200 rounded overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Código</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Descuento</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Descripción</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Usos</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Estado</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {coupons.map((coupon) => {
                  const isConfirming = confirmDelete === coupon.id
                  const isBusy = busy === coupon.id
                  const expired = coupon.expires_at ? new Date(coupon.expires_at) < new Date() : false

                  return (
                    <tr key={coupon.id} className="bg-white hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono font-semibold text-gray-900">{coupon.code}</td>
                      <td className="px-4 py-3 text-gray-700">{Math.round(coupon.discount * 100)}%</td>
                      <td className="px-4 py-3 text-gray-500">{coupon.description ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-700 font-mono">
                        {coupon.used_count}{coupon.usage_limit != null ? ` / ${coupon.usage_limit}` : ''}
                      </td>
                      <td className="px-4 py-3">
                        {expired ? (
                          <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-500">Expirado</span>
                        ) : coupon.active ? (
                          <span className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-700">Activo</span>
                        ) : (
                          <span className="text-xs px-2 py-0.5 rounded bg-orange-100 text-orange-700">Inactivo</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isConfirming ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-gray-500">¿Eliminar?</span>
                            <button
                              onClick={() => handleDelete(coupon.id)}
                              disabled={isBusy}
                              className="text-xs px-2 py-0.5 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                            >
                              {isBusy ? '...' : 'Sí'}
                            </button>
                            <button
                              onClick={() => setConfirmDelete(null)}
                              className="text-xs px-2 py-0.5 bg-gray-200 text-gray-700 rounded"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDelete(coupon.id)}
                            className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                            title="Eliminar cupón"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Detalles del cliente ─────────────────────────────────────────────────────

function CustomerDetail({
  phone,
  messages,
  conversations,
}: {
  phone: string | null
  messages: Message[]
  conversations: Conversation[]
}) {
  const [copied, setCopied] = useState(false)
  const [, forceUpdate] = useState(0)
  const [aiPaused, setAiPaused] = useState(false)
  const [toggling, setToggling] = useState(false)

  useEffect(() => {
    if (!phone) return
    fetch(`/api/conversations/${encodeURIComponent(phone)}/toggle`)
      .then((r) => r.json())
      .then((d) => setAiPaused(d.ai_paused ?? false))
      .catch(() => {})
  }, [phone])

  async function handleToggleAI() {
    if (!phone || toggling) return
    setToggling(true)
    try {
      const res = await fetch(`/api/conversations/${encodeURIComponent(phone)}/toggle`, {
        method: 'PUT',
      })
      const data = await res.json()
      setAiPaused(data.ai_paused)
    } catch {
      // silencioso
    } finally {
      setToggling(false)
    }
  }

  useEffect(() => {
    const interval = setInterval(() => forceUpdate((n) => n + 1), 30000)
    return () => clearInterval(interval)
  }, [])

  if (!phone) {
    return (
      <div className="flex items-center justify-center h-full text-center px-4">
        <span className="text-sm text-gray-400">Selecciona un cliente para ver detalles</span>
      </div>
    )
  }

  const conv = conversations.find((c) => c.customer_phone === phone)

  const seenIntents = Array.from(
    new Set(messages.filter((m) => m.direction === 'inbound').map((m) => m.intent as Intent)),
  )

  function handleCopy() {
    navigator.clipboard.writeText('+' + phone)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const lastActive = conv?.last_message_at
    ? formatDistanceToNow(new Date(conv.last_message_at), { locale: es, addSuffix: true })
    : '—'

  const firstContact = conv?.first_contact_at
    ? format(new Date(conv.first_contact_at), "d 'de' MMMM yyyy, HH:mm", { locale: es })
    : '—'

  return (
    <div className="p-4 overflow-y-auto h-full">
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">
        Detalles del Cliente
      </div>

      {/* Toggle modo manual / AI */}
      <div className="mb-5 p-3 rounded border border-gray-200 bg-gray-50">
        <div className="text-xs text-gray-500 mb-2 font-medium">Modo de respuesta</div>
        <button
          onClick={handleToggleAI}
          disabled={toggling}
          className={`w-full flex items-center justify-between px-3 py-2 rounded text-sm font-medium transition-colors ${
            aiPaused
              ? 'bg-orange-50 border border-orange-300 text-orange-700 hover:bg-orange-100'
              : 'bg-green-50 border border-green-300 text-green-700 hover:bg-green-100'
          } disabled:opacity-50`}
        >
          <span className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${aiPaused ? 'bg-orange-400' : 'bg-green-500'}`} />
            {aiPaused ? 'Modo manual (tú respondes)' : 'AI activo (responde solo)'}
          </span>
          <span className="text-xs opacity-60">{toggling ? '...' : 'cambiar'}</span>
        </button>
        {aiPaused && (
          <p className="text-xs text-orange-600 mt-1.5">
            El AI no responderá. Contesta desde WhatsApp.
          </p>
        )}
      </div>

      {/* Teléfono */}
      <div className="mb-4">
        <div className="text-xs text-gray-500 mb-1">Teléfono</div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-base font-semibold text-gray-900">+{phone}</span>
          <button
            onClick={handleCopy}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            title="Copiar número"
          >
            {copied ? (
              <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Estadísticas */}
      <div className="mb-4">
        <div className="text-xs text-gray-500 mb-1">Total mensajes</div>
        <div className="font-mono text-2xl font-bold text-gray-900">{messages.length}</div>
        <div className="text-xs text-gray-400">mensajes</div>
      </div>

      <div className="mb-4">
        <div className="text-xs text-gray-500 mb-1">Primer contacto</div>
        <div className="font-mono text-sm text-gray-700">{firstContact}</div>
      </div>

      <div className="mb-4">
        <div className="text-xs text-gray-500 mb-1">Última actividad</div>
        <div className="text-sm text-gray-700">{lastActive}</div>
      </div>

      {/* Intenciones vistas */}
      {seenIntents.length > 0 && (
        <div className="mb-5">
          <div className="text-xs text-gray-500 mb-2">Intenciones detectadas</div>
          <div className="flex flex-wrap gap-1.5">
            {seenIntents.map((intent) => (
              <span
                key={intent}
                className="text-xs px-2 py-0.5 rounded-sm border font-mono"
                style={{
                  borderColor: INTENT_COLORS[intent] ?? '#9CA3AF',
                  color: INTENT_COLORS[intent] ?? '#9CA3AF',
                }}
              >
                {INTENT_LABELS[intent] ?? intent}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Pedidos del cliente */}
      <div className="border-t border-gray-100 pt-4">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Pedidos
        </div>
        <OrdersSection phone={phone} />
      </div>
    </div>
  )
}

// ─── Dashboard principal ──────────────────────────────────────────────────────

export function Dashboard() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'chat' | 'productos' | 'cupones'>('chat')

  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch('/api/conversations', { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        setConversations(data)
      }
    } catch (error) {
      console.error('Error cargando conversaciones:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadMessages = useCallback(async (phone: string) => {
    try {
      const res = await fetch(`/api/messages?phone=${encodeURIComponent(phone)}`, {
        cache: 'no-store',
      })
      if (res.ok) {
        const data = await res.json()
        setMessages(data)
      }
    } catch (error) {
      console.error('Error cargando mensajes:', error)
    }
  }, [])

  function handleSelect(phone: string) {
    setSelectedPhone(phone)
    setMessages([])
    loadMessages(phone)
  }

  function handleDeleteConversation(phone: string) {
    setConversations((prev) => prev.filter((c) => c.customer_phone !== phone))
    if (selectedPhone === phone) {
      setSelectedPhone(null)
      setMessages([])
    }
  }

  useEffect(() => {
    loadConversations()
  }, [loadConversations])

  useEffect(() => {
    const supabase = createBrowserClient()

    const channel = supabase
      .channel('messages-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const newMsg = payload.new as Message
          loadConversations()
          if (newMsg.customer_phone === selectedPhone) {
            setMessages((prev) => [...prev, newMsg])
          }
        },
      )
      .subscribe()

    const pollInterval = setInterval(() => {
      loadConversations()
      if (selectedPhone) loadMessages(selectedPhone)
    }, 10000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(pollInterval)
    }
  }, [selectedPhone, loadConversations, loadMessages])

  const selectedConv = conversations.find((c) => c.customer_phone === selectedPhone)

  return (
    <>
      <div className="lg:hidden flex items-center justify-center h-screen bg-white px-8 text-center">
        <p className="text-sm text-gray-500">
          El dashboard está optimizado para escritorio. Por favor usa una pantalla mayor a 1024px.
        </p>
      </div>

      <div className="hidden lg:flex h-screen overflow-hidden bg-white">
        {/* Header global */}
        <div className="fixed top-0 left-0 right-0 z-10 bg-white border-b border-gray-200 px-4 h-10 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-gray-900">Freshco</span>
              <span className="text-xs text-gray-400">— Dashboard WhatsApp</span>
            </div>
            {/* Tabs */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setActiveTab('chat')}
                className={`text-xs px-3 py-1 rounded transition-colors ${
                  activeTab === 'chat'
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                Chat
              </button>
              <button
                onClick={() => setActiveTab('productos')}
                className={`text-xs px-3 py-1 rounded transition-colors ${
                  activeTab === 'productos'
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                Productos
              </button>
              <button
                onClick={() => setActiveTab('cupones')}
                className={`text-xs px-3 py-1 rounded transition-colors ${
                  activeTab === 'cupones'
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                Cupones
              </button>
            </div>
          </div>
          {loading && (
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-pulse" />
              <span className="text-xs text-gray-400">Cargando...</span>
            </div>
          )}
        </div>

        {/* Layout debajo del header */}
        <div className="flex w-full mt-10 h-[calc(100vh-2.5rem)]">
          {activeTab === 'chat' ? (
            <>
              {/* Columna izquierda: conversaciones */}
              <div className="w-80 flex-shrink-0 h-full overflow-hidden">
                <ConversationList
                  conversations={conversations}
                  selectedPhone={selectedPhone}
                  onSelect={handleSelect}
                  onDelete={handleDeleteConversation}
                />
              </div>

              {/* Columna central: chat */}
              <div className="flex-1 h-full overflow-hidden border-r border-gray-200">
                <ChatView
                  phone={selectedPhone}
                  messages={messages}
                  firstContactAt={selectedConv?.first_contact_at}
                />
              </div>

              {/* Columna derecha: detalles del cliente */}
              <div className="w-72 flex-shrink-0 h-full overflow-hidden border-r border-gray-200">
                <CustomerDetail
                  phone={selectedPhone}
                  messages={messages}
                  conversations={conversations}
                />
              </div>
            </>
          ) : activeTab === 'productos' ? (
            <ProductosView />
          ) : (
            <CouponesView />
          )}
        </div>
      </div>
    </>
  )
}
