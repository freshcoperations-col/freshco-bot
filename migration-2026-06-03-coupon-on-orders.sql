-- =====================================================================
-- Migration: campos cupón en orders
-- Permite registrar qué cupón usó el cliente y cuánto se le descontó.
-- =====================================================================

BEGIN;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS coupon_code     TEXT,
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0;

COMMIT;

-- Verificación
SELECT id, total, coupon_code, discount_amount FROM orders ORDER BY created_at DESC LIMIT 5;
