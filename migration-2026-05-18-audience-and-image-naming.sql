-- =====================================================================
-- Migration: add `audience`, normalize `colors`, align product IDs
-- to the new Storage naming convention:
--     {product-id}-alfrente-{color-slug}.png
--     {product-id}-detras-{color-slug}.png
--
-- Run AFTER migration-2026-05-18-collections-cleanup.sql.
-- =====================================================================

BEGIN;

-- 1. Audience column (mujer / hombre / unisex). Default unisex.
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS audience TEXT NOT NULL DEFAULT 'unisex'
  CHECK (audience IN ('mujer', 'hombre', 'unisex'));

CREATE INDEX IF NOT EXISTS idx_products_audience ON products(audience);

-- 2. Align product IDs with the Storage slugs. The web reads images as
--    `${product.id}-alfrente-${slug(color)}.png`, so the PK must match
--    the bucket file prefix exactly.
--
--    Update each row only if the old id exists. PK updates cascade
--    nowhere now that the pivot table is gone (only the row itself
--    references the id).
UPDATE products SET id = 'modo-freshco'  WHERE id = 'modo-fresco';
UPDATE products SET id = 'que-todo-fluya' WHERE id = 'que-fluya';
-- 'ritmo-interno' and 'no-se-mate-el-coco' should already match.

-- 3. Only color in Storage right now is Vainilla. Replace any stale
--    color arrays so the web doesn't try to load colors that don't
--    have images yet.
UPDATE products SET colors = ARRAY['Vainilla'];

-- 4. All current products are unisex. Explicit assignment in case the
--    column existed previously with a different default.
UPDATE products SET audience = 'unisex';

-- 5. Rebuild the view so SELECT * picks up the new audience column.
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

-- =====================================================================
-- Verificación
-- =====================================================================

-- Should list each product with audience='unisex' and colors={Vainilla}.
SELECT id, name, audience, colors FROM products ORDER BY id;

-- IDs must match exactly the bucket file prefixes:
--   modo-freshco, no-se-mate-el-coco, que-todo-fluya, ritmo-interno
SELECT id FROM products ORDER BY id;
