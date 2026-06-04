-- =====================================================================
-- Migration: restricción one_per_customer en cupones
-- Garantiza que un cupón de bienvenida solo se use una vez por cliente.
-- =====================================================================

BEGIN;

-- Columna que marca si el cupón es de un solo uso por cliente.
ALTER TABLE coupons
  ADD COLUMN IF NOT EXISTS one_per_customer BOOLEAN NOT NULL DEFAULT false;

-- Historial de usos por cliente (referente: email o teléfono).
CREATE TABLE IF NOT EXISTS coupon_uses (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id      UUID NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
  customer_email TEXT,
  customer_phone TEXT,
  order_id       UUID,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coupon_uses_coupon_email  ON coupon_uses(coupon_id, customer_email);
CREATE INDEX IF NOT EXISTS idx_coupon_uses_coupon_phone  ON coupon_uses(coupon_id, customer_phone);

-- RLS: el anon puede insertar (la webpage lo hace tras crear la orden).
ALTER TABLE coupon_uses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon can insert coupon_uses"
  ON coupon_uses FOR INSERT TO anon
  WITH CHECK (TRUE);

CREATE POLICY "service_role full access coupon_uses"
  ON coupon_uses FOR ALL TO service_role
  USING (TRUE) WITH CHECK (TRUE);

-- Marcar BIENVENIDA-FRESHCO como one_per_customer.
UPDATE coupons SET one_per_customer = true WHERE UPPER(code) = 'BIENVENIDA-FRESHCO';

COMMIT;
