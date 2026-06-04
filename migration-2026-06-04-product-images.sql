-- =====================================================================
-- Migration: columna images en products
-- Arreglo escalable para múltiples tipos de prenda y fotos de modelos.
-- Backward compatible: las camisetas actuales (naming convention) siguen
-- funcionando. Los nuevos productos usan images[] directamente.
-- =====================================================================

BEGIN;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS images JSONB NOT NULL DEFAULT '[]';

-- Rebuild de la vista para incluir el campo.
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
SELECT id, name, jsonb_array_length(images) AS extra_images FROM products ORDER BY id;
