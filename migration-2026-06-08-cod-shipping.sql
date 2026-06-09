-- ============================================================
-- Contraentrega y nuevos precios de envío
-- ============================================================

-- Agregar 'cod' (cash on delivery) al CHECK de payment_status.
-- PostgreSQL no permite ALTER de una CHECK existente — hay que drop+recrear.
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_payment_status_check
  CHECK (payment_status IN ('pending', 'approved', 'declined', 'voided', 'error', 'cod'));

-- shipping_cost: guardar el costo de envío por separado para reportes
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_cost integer NOT NULL DEFAULT 0;
