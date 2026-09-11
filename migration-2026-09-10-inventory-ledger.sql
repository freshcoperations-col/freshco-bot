-- =====================================================================
-- Migration: libro de movimientos de inventario + descuento atómico
--
-- Problema que resuelve:
--   1. El descuento de stock estaba reimplementado en 4 lugares distintos
--      (webhook Wompi, aprobar pago en el admin, create_order del bot,
--      cancelar pedido) y cada copia hacía algo diferente. La webpage ni
--      siquiera descontaba.
--   2. No había idempotencia: Wompi reintenta el webhook ante cualquier
--      respuesta que no sea 2xx, y cada reintento volvía a descontar.
--   3. El descuento de variantes en JSONB desde JS es read-modify-write:
--      dos ventas simultáneas de la última unidad se pisaban.
--
-- Solución: inventory_log pasa a ser el LIBRO de movimientos, con una
-- clave única que hace imposible aplicar dos veces el mismo pedido, y el
-- descuento por variante se hace en una función atómica con lock de fila.
--
-- Ejecutar en Supabase Dashboard → SQL Editor.
-- =====================================================================

BEGIN;

-- ─── 1. inventory_log pasa a cubrir también el stock por producto ──────────

ALTER TABLE inventory_log
  ADD COLUMN IF NOT EXISTS product_id text REFERENCES products(id) ON DELETE SET NULL;

-- Qué contador movió este renglón:
--   'blanks'  → global_inventory (prendas en blanco)
--   'product' → products.stock / products.stock_variants
ALTER TABLE inventory_log
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'blanks';

ALTER TABLE inventory_log DROP CONSTRAINT IF EXISTS inventory_log_kind_check;
ALTER TABLE inventory_log ADD CONSTRAINT inventory_log_kind_check
  CHECK (kind IN ('blanks', 'product'));

-- Nuevos motivos: reversa de una venta (pedido cancelado) y producción.
ALTER TABLE inventory_log DROP CONSTRAINT IF EXISTS inventory_log_reason_check;
ALTER TABLE inventory_log ADD CONSTRAINT inventory_log_reason_check
  CHECK (reason IN ('sale', 'sale_reverted', 'manual_set', 'manual_delete', 'production'));

-- ─── 2. Idempotencia ──────────────────────────────────────────────────────

-- Puede haber duplicados de antes (reintentos de Wompi ya cobrados dos
-- veces al inventario). Nos quedamos con el más antiguo de cada grupo para
-- poder crear el índice único.
DELETE FROM inventory_log a
USING inventory_log b
WHERE a.order_id IS NOT NULL
  AND a.order_id       = b.order_id
  AND a.kind           = b.kind
  AND a.reason         = b.reason
  AND a.size           = b.size
  AND a.color          = b.color
  AND coalesce(a.product_id, '') = coalesce(b.product_id, '')
  AND a.created_at     > b.created_at;

-- A partir de acá, el mismo pedido no puede aplicarse dos veces sobre la
-- misma variante: el INSERT del libro falla y el código no descuenta.
CREATE UNIQUE INDEX IF NOT EXISTS inventory_log_order_unique
  ON inventory_log (order_id, kind, reason, coalesce(product_id, ''), size, color)
  WHERE order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS inventory_log_product_idx ON inventory_log (product_id);

-- ─── 3. Descuento atómico del stock del producto ──────────────────────────

-- Mueve el stock de UN producto respetando su stock_mode.
-- p_qty positivo descuenta, negativo devuelve (para cancelaciones).
-- El FOR UPDATE serializa dos ventas simultáneas de la última unidad.
CREATE OR REPLACE FUNCTION apply_product_stock(
  p_product_id text,
  p_size       text,
  p_color      text,
  p_qty        int
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_mode     text;
  v_variants jsonb;
  v_out      jsonb := '[]'::jsonb;
  v_elem     jsonb;
  v_qty      int;
  v_total    int := 0;
BEGIN
  SELECT stock_mode, coalesce(stock_variants, '[]'::jsonb)
    INTO v_mode, v_variants
    FROM products
   WHERE id = p_product_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_mode = 'variantes' THEN
    FOR v_elem IN SELECT * FROM jsonb_array_elements(v_variants) LOOP
      IF (v_elem ->> 'size')  IS NOT DISTINCT FROM nullif(p_size, '')
     AND (v_elem ->> 'color') IS NOT DISTINCT FROM nullif(p_color, '') THEN
        v_qty  := greatest(0, coalesce((v_elem ->> 'quantity')::int, 0) - p_qty);
        v_elem := jsonb_set(v_elem, '{quantity}', to_jsonb(v_qty));
      ELSE
        v_qty := coalesce((v_elem ->> 'quantity')::int, 0);
      END IF;
      v_total := v_total + v_qty;
      v_out   := v_out || v_elem;
    END LOOP;

    UPDATE products
       SET stock_variants = v_out,
           stock          = v_total,
           out_of_stock   = (v_total = 0)
     WHERE id = p_product_id;
  ELSE
    UPDATE products
       SET stock        = greatest(0, stock - p_qty),
           out_of_stock = (greatest(0, stock - p_qty) = 0)
     WHERE id = p_product_id;
  END IF;
END;
$$;

COMMIT;

-- Verificación: columnas nuevas del libro.
SELECT column_name FROM information_schema.columns
WHERE table_name = 'inventory_log' AND column_name IN ('product_id', 'kind')
ORDER BY column_name;

-- Verificación: la función quedó creada.
SELECT proname FROM pg_proc WHERE proname = 'apply_product_stock';

-- Verificación: el índice único de idempotencia existe.
SELECT indexname FROM pg_indexes WHERE indexname = 'inventory_log_order_unique';
