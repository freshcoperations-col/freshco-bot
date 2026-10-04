-- =====================================================================
-- Migration: los productos de una colección desactivada dejan de verse
--
-- Antes, desactivar una colección solo la sacaba de la lista de colecciones:
-- sus productos seguían en el catálogo, la búsqueda y el bot.
--
-- Nueva columna calculada en la vista: collection_active.
--   false → el producto tiene colecciones y TODAS las que existen están
--           desactivadas: no se muestra.
--   true  → tiene al menos una colección activa, o no tiene colección (o solo
--           colecciones que ya no existen): se muestra como siempre.
--
-- Un producto puede estar en varias colecciones; basta con que una esté
-- activa para que se siga viendo.
--
-- `available` NO se toca: sigue siendo el interruptor "Mostrar" del admin.
-- La tienda y el bot muestran un producto solo si available Y collection_active.
--
-- Ejecutar en Supabase Dashboard → SQL Editor, en el proyecto WEB.
-- =====================================================================

BEGIN;

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

COMMIT;

-- Verificación: con todas las colecciones activas, ningún producto debe
-- salir oculto por colección.
SELECT collection_active, count(*) FROM products_full GROUP BY collection_active;
