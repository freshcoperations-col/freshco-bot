-- =====================================================================
-- Migration: tracking de envío en `orders` para que el bot notifique al
-- cliente cuando un pedido sale con guía.
-- =====================================================================

BEGIN;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS tracking_number   TEXT,
  ADD COLUMN IF NOT EXISTS shipping_carrier  TEXT,
  ADD COLUMN IF NOT EXISTS shipped_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS shipping_notified_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_orders_tracking_number
  ON orders(tracking_number) WHERE tracking_number IS NOT NULL;

COMMIT;
