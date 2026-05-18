-- =====================================================================
-- Migration: clean up collections — keep inline array, drop pivot table.
-- Run this ONCE in the Supabase SQL editor against the existing data.
-- =====================================================================

BEGIN;

-- 1. Drop the pivot table (no longer used; webpage reads inline collections).
DROP TABLE IF EXISTS product_collections CASCADE;

-- 2. Ensure the new collection exists.
INSERT INTO collections (id, label, description, sort_order, active)
VALUES ('todo-melo', 'Todo Melo (O Eso Parece)',
        'Camisetas oversize con humor, frescura y cero filtro.', 1, TRUE)
ON CONFLICT (id) DO UPDATE
  SET label = EXCLUDED.label,
      description = EXCLUDED.description;

-- 3. Move every product to 'todo-melo' (overwriting the bogus 'urban'/'verano').
UPDATE products SET collections = ARRAY['todo-melo'];

-- 4. Remove stale collections that no longer apply.
DELETE FROM collections WHERE id IN ('cartoon', 'urban', 'verano');

-- 5. Rebuild the products_full view (no pivot now).
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

-- 6. Add a GIN index to make collection filters fast.
CREATE INDEX IF NOT EXISTS idx_products_collections
  ON products USING gin(collections);

COMMIT;

-- =====================================================================
-- Verification — run after the transaction commits.
-- =====================================================================

-- Should list each product with its single collection 'todo-melo'.
SELECT id, name, collections, garment_type FROM products;

-- Should list only 'todo-melo'.
SELECT id, label FROM collections;

-- Should return: Todo Melo (O Eso Parece) | <number of products>
SELECT c.label, COUNT(p.id) AS productos
FROM collections c
LEFT JOIN products p ON c.id = ANY(p.collections)
GROUP BY c.label;

-- The view should show every product with its labels resolved.
SELECT id, name, garment_type_label, collection_labels FROM products_full;
