-- ============================================================
-- Soporte para pedidos y links de pago creados desde el admin
-- ============================================================

-- 1. Ampliar el CHECK de source para incluir 'admin_manual' y 'payment_link'.
--    PostgreSQL no permite ALTER de una CHECK existente — hay que drop+recrear.
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_source_check;
ALTER TABLE orders ADD CONSTRAINT orders_source_check
  CHECK (source IN ('whatsapp_bot', 'webpage', 'admin_manual', 'payment_link'));

-- 2. Columna de notas internas (comentarios del admin, referencia a pedido relacionado, etc.)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS notes TEXT;
