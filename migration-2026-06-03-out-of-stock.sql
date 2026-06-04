-- =====================================================================
-- Migration: columna out_of_stock en products
-- Separa "ocultar producto" (available=false → no aparece en la web)
-- de "marcar como agotado" (out_of_stock=true → aparece con badge AGOTADO).
-- =====================================================================

BEGIN;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS out_of_stock BOOLEAN NOT NULL DEFAULT false;

-- Si el stock es 0, marcarlo como agotado automáticamente.
UPDATE products SET out_of_stock = true WHERE stock = 0;

-- Rebuild de la vista para que incluya el campo nuevo.
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

-- Verificación
SELECT id, name, available, out_of_stock, stock FROM products ORDER BY id;
