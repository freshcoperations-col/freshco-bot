-- =====================================================================
-- Migration: columna free_shipping en products + actualizar la vista.
-- Si un producto tiene free_shipping=true, el bot aplica envío gratis
-- en esa orden sin importar el total ni la ciudad.
-- =====================================================================

BEGIN;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS free_shipping BOOLEAN DEFAULT FALSE;

-- Recrear la vista para incluir el campo nuevo.
CREATE OR REPLACE VIEW products_full AS
SELECT
  p.*,
  gt.label AS garment_type_label,
  ARRAY(
    SELECT c.label FROM collections c WHERE c.id = ANY(p.collections)
  ) AS collection_labels
FROM products p
LEFT JOIN garment_types gt ON gt.id = p.garment_type;

COMMIT;
