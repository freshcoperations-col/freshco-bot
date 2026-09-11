-- =====================================================================
-- Migration: modo de stock por producto (general | variantes)
--
-- `stock_mode` decide cómo se lleva el inventario de ESE producto:
--   'general'   → un solo número en products.stock (comportamiento actual)
--   'variantes' → cantidades por talla+color en products.stock_variants,
--                 y products.stock se recalcula como la suma.
--
-- products.stock se mantiene SIEMPRE con el total, así que nada de lo que
-- hoy lee stock (tienda, listados, analíticas) necesita cambiar.
--
-- IMPORTANTE: también reconstruye la vista products_full. Se creó con
-- `SELECT p.*`, que Postgres expande a una lista fija de columnas en el
-- momento de crearla — por eso las columnas agregadas después (stock_variants,
-- out_of_stock_sizes, out_of_stock_colors) NO estaban saliendo en la vista.
--
-- Ejecutar en Supabase Dashboard → SQL Editor.
-- =====================================================================

BEGIN;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS stock_mode text NOT NULL DEFAULT 'general';

-- CHECK idempotente (no existe ADD CONSTRAINT IF NOT EXISTS).
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_stock_mode_check;
ALTER TABLE products ADD CONSTRAINT products_stock_mode_check
  CHECK (stock_mode IN ('general', 'variantes'));

-- Todos los productos existentes arrancan en 'general' por el DEFAULT,
-- así que no hace falta migrar datos a mano.

-- Rebuild de la vista para que exponga TODAS las columnas actuales.
DROP VIEW IF EXISTS products_full;
CREATE VIEW products_full AS
SELECT
  p.*,
  gt.label AS garment_type_label,
  ARRAY(
    SELECT c.label FROM collections c WHERE c.id = ANY(p.collections)
  ) AS collection_labels
FROM products p
LEFT JOIN garment_types gt ON gt.id = p.garment_type;

COMMIT;

-- Verificación: las tres columnas deben aparecer en la vista.
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'products_full'
  AND column_name IN ('stock_mode', 'stock_variants', 'out_of_stock_sizes', 'out_of_stock_colors')
ORDER BY column_name;

-- Verificación: todo el catálogo debe quedar en 'general'.
SELECT stock_mode, count(*) FROM products GROUP BY stock_mode;
