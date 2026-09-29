-- =====================================================================
-- Migration: banners administrables + imagen de colección con enfoque
--
-- Antes, los banners eran archivos con un nombre obligatorio en el bucket
-- `banners` (banner-{n}-{si|no}-{desktop|mobile}.{ext}). La tienda no podía
-- listar el bucket con la llave pública y probaba nombre por nombre: hasta 48
-- pedidos por visita. Y como solo había versiones desktop, en celular el
-- carrusel no mostraba nada.
--
-- Ahora cada banner es una fila: imagen de computador, imagen de celular,
-- link opcional, orden y activo. La tienda hace UNA consulta.
--
-- Ejecutar en Supabase Dashboard → SQL Editor, en el proyecto WEB.
-- =====================================================================

BEGIN;

-- ─── 1. Banners ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS banners (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  title         text        NOT NULL DEFAULT '',   -- nombre interno + texto alternativo
  desktop_path  text,                              -- ruta dentro del bucket `banners`
  mobile_path   text,                              -- si falta, la tienda usa la de computador
  link_url      text,                              -- NULL = el banner no es clickeable
  sort_order    integer     NOT NULL DEFAULT 0,
  active        boolean     NOT NULL DEFAULT true,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

ALTER TABLE banners ENABLE ROW LEVEL SECURITY;

-- La tienda (llave pública) solo puede LEER los banners activos. Escribir es
-- solo del backend (service_role, que se salta RLS).
DROP POLICY IF EXISTS "public_read_active_banners" ON banners;
CREATE POLICY "public_read_active_banners" ON banners
  FOR SELECT TO anon, authenticated
  USING (active = true);

-- Pasar los banners que ya existen, leyendo el propio bucket: cada número
-- `si` se vuelve una fila con su versión desktop y mobile (si la hay). Solo
-- corre si la tabla está vacía, así que re-ejecutar la migración no duplica.
INSERT INTO banners (title, desktop_path, mobile_path, sort_order, active)
SELECT
  'Banner ' || n,
  max(name) FILTER (WHERE device = 'desktop'),
  max(name) FILTER (WHERE device = 'mobile'),
  n,
  true
FROM (
  SELECT
    name,
    (regexp_match(name, '^banner-(\d+)-si-(desktop|mobile)\.'))[1]::int AS n,
    (regexp_match(name, '^banner-(\d+)-si-(desktop|mobile)\.'))[2]     AS device
  FROM storage.objects
  WHERE bucket_id = 'banners'
    AND name ~* '^banner-\d+-si-(desktop|mobile)\.(png|jpe?g|webp)$'
) legacy
WHERE NOT EXISTS (SELECT 1 FROM banners)
GROUP BY n
ORDER BY n;

-- ─── 2. Colecciones: punto de enfoque y "mostrar nombre" ─────────────────

-- image_focus: dónde está lo importante de la foto, como posición CSS
-- ('50% 30%'). La tarjeta cambia de proporción entre computador y celular, y
-- este punto es el que nunca se recorta.
ALTER TABLE collections
  ADD COLUMN IF NOT EXISTS image_focus text    NOT NULL DEFAULT '50% 50%',
  ADD COLUMN IF NOT EXISTS show_title  boolean NOT NULL DEFAULT true;

-- ─── 3. Permiso nuevo: banners_edit ──────────────────────────────────────

UPDATE admin_roles
SET permissions = permissions || '{"banners_edit": true}'::jsonb
WHERE name = 'Admin';

UPDATE admin_roles
SET permissions = permissions || '{"banners_edit": false}'::jsonb
WHERE name <> 'Admin' AND NOT (permissions ? 'banners_edit');

COMMIT;

-- Verificación: los banners que se pasaron desde el bucket.
SELECT sort_order, title, desktop_path, mobile_path, active FROM banners ORDER BY sort_order;
