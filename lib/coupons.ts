import type { SupabaseClient } from '@supabase/supabase-js'

// Validación y registro de cupones — una sola definición para la web y el
// checkout del servidor.
//
// Validar NO consume el cupón. Antes /api/coupons/validate sumaba un uso cada
// vez que alguien le daba "Aplicar", así que un cupón con límite se agotaba
// con gente probando el código.
//
// El uso se registra al crear el pedido con claimCoupon(), que corre en la
// base (claim_coupon) y vuelve a verificar TODAS las reglas con el cupón
// bloqueado: dos pedidos simultáneos no pueden gastar el mismo cupón de un
// solo uso. checkCoupon() es solo para dar el error temprano y bonito.

export interface ValidCoupon {
  id: string
  code: string
  discount: number         // decimal: 0.2 = 20 %
  description: string | null
  one_per_customer: boolean
  first_purchase_only: boolean
}

export async function checkCoupon(
  supabase: SupabaseClient,
  rawCode: string,
  customer: { email?: string | null; phone?: string | null },
): Promise<{ ok: true; coupon: ValidCoupon } | { ok: false; error: string }> {
  const code = rawCode.trim().toUpperCase()
  if (!code) return { ok: false, error: 'Código requerido' }

  const { data: c } = await supabase
    .from('coupons')
    .select('id, code, discount, description, active, usage_limit, used_count, expires_at, one_per_customer, first_purchase_only')
    .eq('active', true)
    .ilike('code', code)
    .maybeSingle()

  if (!c) return { ok: false, error: 'Código no válido o inactivo' }
  if (c.expires_at && new Date(c.expires_at as string) < new Date()) {
    return { ok: false, error: 'Este código ya expiró' }
  }
  if (c.usage_limit != null && (c.used_count as number) >= (c.usage_limit as number)) {
    return { ok: false, error: 'Este código ya alcanzó su límite de usos' }
  }

  // Sin comas ni paréntesis: van dentro de un filtro .or() de PostgREST y,
  // en la ruta pública, vienen del navegador.
  const clean = (v?: string | null) => v?.trim().replace(/[,()]/g, '') || null
  const email = clean(customer.email)?.toLowerCase() ?? null
  const phone = clean(customer.phone)?.replace(/\D/g, '') || null

  if (c.first_purchase_only && (email || phone)) {
    const { data: bought } = await supabase.rpc('customer_has_purchases', { p_email: email, p_phone: phone })
    if (bought) return { ok: false, error: 'Este código es solo para la primera compra.' }
  }

  if (c.one_per_customer) {
    if (email || phone) {
      // Por correo O por teléfono: usarlo una vez con cualquiera de los dos cuenta.
      const filters = [email ? `customer_email.eq.${email}` : null, phone ? `customer_phone.eq.${phone}` : null]
        .filter(Boolean)
        .join(',')
      const { data: used } = await supabase
        .from('coupon_uses')
        .select('id')
        .eq('coupon_id', c.id)
        .or(filters)
        .limit(1)
        .maybeSingle()
      if (used) return { ok: false, error: 'Este código es de un solo uso por cliente y ya lo usaste.' }
    }
  }

  return {
    ok: true,
    coupon: {
      id: String(c.id),
      code: String(c.code),
      discount: Number(c.discount),
      description: (c.description as string | null) ?? null,
      one_per_customer: Boolean(c.one_per_customer),
      first_purchase_only: Boolean(c.first_purchase_only),
    },
  }
}

// Reserva el uso del cupón ANTES de crear el pedido. Si el pedido no se
// crea, hay que llamar releaseCoupon(); si se crea, attachCouponUse().
export async function claimCoupon(
  supabase: SupabaseClient,
  code: string,
  customer: { email?: string | null; phone?: string | null },
): Promise<{ ok: true; useId: string } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc('claim_coupon', {
    p_code: code,
    p_email: customer.email ?? null,
    p_phone: customer.phone ?? null,
  })
  if (error || !data) {
    // Los RAISE de claim_coupon traen el motivo para el cliente (P0001).
    return { ok: false, error: error?.code === 'P0001' ? error.message : 'No se pudo aplicar el cupón. Intenta de nuevo.' }
  }
  return { ok: true, useId: String(data) }
}

export async function attachCouponUse(supabase: SupabaseClient, useId: string, orderId: string): Promise<void> {
  const { error } = await supabase.from('coupon_uses').update({ order_id: orderId }).eq('id', useId)
  if (error) console.error('[cupón] no se pudo asociar el uso al pedido:', error)
}

export async function releaseCoupon(supabase: SupabaseClient, useId: string): Promise<void> {
  const { error } = await supabase.rpc('release_coupon', { p_use_id: useId })
  if (error) console.error('[cupón] no se pudo liberar el uso:', error)
}
