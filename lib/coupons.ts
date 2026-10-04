import type { SupabaseClient } from '@supabase/supabase-js'

// Validación y registro de cupones — una sola definición para la web y el
// checkout del servidor.
//
// Validar NO consume el cupón. Antes /api/coupons/validate sumaba un uso cada
// vez que alguien le daba "Aplicar", así que un cupón con límite se agotaba
// con gente probando el código. El uso se registra solo al crear el pedido.

export interface ValidCoupon {
  id: string
  code: string
  discount: number         // decimal: 0.2 = 20 %
  description: string | null
  one_per_customer: boolean
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
    .select('id, code, discount, description, active, usage_limit, used_count, expires_at, one_per_customer')
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

  if (c.one_per_customer) {
    // Sin comas ni paréntesis: van dentro de un filtro .or() de PostgREST y,
    // en la ruta pública, vienen del navegador.
    const clean = (v?: string | null) => v?.trim().replace(/[,()]/g, '') || null
    const email = clean(customer.email)?.toLowerCase() ?? null
    const phone = clean(customer.phone)
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
    },
  }
}

// Registra el uso al crear un pedido: suma used_count y deja la fila en
// coupon_uses (que es lo que hace cumplir "uno por cliente").
export async function recordCouponUse(
  supabase: SupabaseClient,
  coupon: ValidCoupon,
  use: { email?: string | null; phone?: string | null; orderId: string },
): Promise<void> {
  const { data: current } = await supabase.from('coupons').select('used_count').eq('id', coupon.id).maybeSingle()
  await Promise.all([
    supabase.from('coupons').update({ used_count: ((current?.used_count as number) ?? 0) + 1 }).eq('id', coupon.id),
    supabase.from('coupon_uses').insert({
      coupon_id: coupon.id,
      customer_email: use.email?.trim().toLowerCase() || null,
      customer_phone: use.phone?.trim() || null,
      order_id: use.orderId,
    }),
  ])
}
