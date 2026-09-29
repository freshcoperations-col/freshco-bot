-- =====================================================================
-- Migration: historial de importaciones de productos por CSV
--
-- Cada importación aplicada deja:
--   product_imports  → una fila por archivo subido (quién, cuándo, cuánto)
--   product_changes  → una fila por CAMPO cambiado, con el valor anterior
--
-- Con eso una importación se puede deshacer completa: se restaura el valor
-- anterior de cada campo, salvo que alguien lo haya vuelto a cambiar después
-- (en ese caso se respeta el cambio posterior y se reporta).
--
-- Ejecutar en Supabase Dashboard → SQL Editor.
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS product_imports (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at       timestamptz DEFAULT now(),
  actor_email      text,
  file_name        text,
  products_changed integer     NOT NULL DEFAULT 0,
  fields_changed   integer     NOT NULL DEFAULT 0,
  reverted_at      timestamptz,
  reverted_by      text
);

CREATE TABLE IF NOT EXISTS product_changes (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  import_id   uuid        NOT NULL REFERENCES product_imports(id) ON DELETE CASCADE,
  product_id  text        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  field       text        NOT NULL,
  old_value   jsonb,
  new_value   jsonb,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS product_changes_import_idx  ON product_changes (import_id);
CREATE INDEX IF NOT EXISTS product_changes_product_idx ON product_changes (product_id);
CREATE INDEX IF NOT EXISTS product_imports_created_idx ON product_imports (created_at DESC);

-- RLS activo y SIN políticas: nadie con la anon key puede leer ni escribir.
-- El backend usa service_role, que se salta RLS. (Una política
-- `FOR ALL USING (true)` sin rol, como tienen otras tablas, abriría estas
-- tablas también a la anon key que va en el JS público de la tienda.)
ALTER TABLE product_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_changes ENABLE ROW LEVEL SECURITY;

COMMIT;

-- Verificación: las dos tablas existen.
SELECT table_name FROM information_schema.tables
WHERE table_name IN ('product_imports', 'product_changes')
ORDER BY table_name;
