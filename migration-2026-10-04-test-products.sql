-- =====================================================================
-- Migration: productos de prueba
--
-- "Prueba Pago" ($1.500) existe para probar pagos reales, pero estaba
-- visible en la tienda y encabezaba "Más vendidos" con sus ventas de prueba.
--
-- Nueva columna products.is_test. Un producto de prueba:
--   · no aparece en el catálogo, la búsqueda, "Más vendidos" ni en el bot
--   · no cuenta en las analíticas de ventas
--   · SÍ se puede comprar desde su link directo (para seguir probando pagos)
--
-- Ejecutar en Supabase Dashboard → SQL Editor, en el proyecto WEB.
-- Correr ANTES de que se despliegue el código que lee is_test.
-- =====================================================================

BEGIN;

ALTER TABLE products ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
UPDATE products SET is_test = true WHERE id = 'prueba-pago';

-- products_full usa p.*, que se expande al crearla: hay que recrearla para
-- que incluya la columna nueva. Misma definición que collection-active.
DROP VIEW IF EXISTS products_full;
CREATE VIEW products_full AS
SELECT
  p.*,
  gt.label AS garment_type_label,
  ARRAY(
    SELECT c.label FROM collections c WHERE c.id = ANY(p.collections)
  ) AS collection_labels,
  NOT (
    EXISTS (SELECT 1 FROM collections c WHERE c.id = ANY(p.collections))
    AND NOT EXISTS (SELECT 1 FROM collections c WHERE c.id = ANY(p.collections) AND c.active)
  ) AS collection_active
FROM products p
LEFT JOIN garment_types gt ON gt.id = p.garment_type;

GRANT SELECT ON products_full TO anon, authenticated, service_role;

-- Más vendidos: sin productos de prueba.
CREATE OR REPLACE FUNCTION public.bestseller_counts()
RETURNS TABLE (product_id text, units bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT item ->> 'product_id' AS product_id,
         sum(coalesce((item ->> 'quantity')::int, 1))::bigint AS units
  FROM orders o
  CROSS JOIN LATERAL jsonb_array_elements(coalesce(o.items, '[]'::jsonb)) AS item
  WHERE o.payment_status IN ('approved', 'cod')
    AND item ->> 'product_id' IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM products p WHERE p.id = item ->> 'product_id' AND p.is_test
    )
  GROUP BY 1
  ORDER BY 2 DESC
$$;

COMMIT;

-- Verificación: debe salir prueba-pago con is_test = true (1 fila).
SELECT id, name, is_test FROM products_full WHERE is_test;
