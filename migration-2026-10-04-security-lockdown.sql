-- =====================================================================
-- Migration: permisos de la base redefinidos desde cero
--
-- PROBLEMA: con la llave pública de la tienda (la que cualquiera ve en el
-- navegador) se podían leer pedidos con nombre/teléfono/dirección, todos los
-- mensajes de WhatsApp, los administradores, los cupones y más. La causa:
-- políticas como `FOR ALL USING (true)` sin `TO service_role` aplican a TODOS
-- los roles, incluido el público (anon). Y las funciones de la base se podían
-- ejecutar con esa llave (ej. apply_product_stock cambia stock).
--
-- DESPUÉS de esta migración:
--   · El bot y el admin no cambian: usan la llave de servicio, que no pasa
--     por estas reglas.
--   · La llave pública solo puede LEER: productos, colecciones, tipos de
--     prenda y banners activos.
--   · Un cliente con sesión iniciada puede leer SUS pedidos (Mi perfil).
--   · "Más vendidos" de la tienda sale de bestseller_counts(), que devuelve
--     solo el conteo de unidades por producto, sin datos de clientes.
--   · Nadie con la llave pública puede escribir en ninguna tabla.
--
-- ORDEN: desplegar primero el código (tienda, admin y bot) y DESPUÉS correr
-- esto. La tienda vieja creaba pedidos desde el navegador y dejaría de poder.
--
-- Ejecutar en Supabase Dashboard → SQL Editor, en el proyecto WEB.
-- =====================================================================

BEGIN;

-- 1. RLS en TODAS las tablas del esquema public y fuera todas las políticas.
DO $$
DECLARE
  t record;
  p record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
  FOR p IN SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public' LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, p.tablename);
  END LOOP;
END $$;

-- 2. Lectura pública: solo lo que la tienda muestra.
CREATE POLICY public_read ON products      FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY public_read ON collections   FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY public_read ON garment_types FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY public_read ON banners       FOR SELECT TO anon, authenticated USING (active);

-- 3. Mi perfil: cada cliente ve solo sus pedidos (por el correo de su sesión).
CREATE POLICY own_orders ON orders FOR SELECT TO authenticated
  USING (lower(customer_email) = lower(auth.jwt() ->> 'email'));

-- 4. Funciones: nadie con la llave pública ejecuta funciones de la base,
--    salvo bestseller_counts (abajo). El bot (service_role) sigue pudiendo.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

-- 5. Más vendidos: unidades vendidas por producto en pedidos pagados o
--    contraentrega. SECURITY DEFINER: lee pedidos sin abrirlos al público.
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
  GROUP BY 1
  ORDER BY 2 DESC
$$;
GRANT EXECUTE ON FUNCTION public.bestseller_counts() TO anon, authenticated;

COMMIT;

-- Verificación 1: las únicas políticas que deben quedar (5 filas).
SELECT tablename, policyname, roles, cmd FROM pg_policies WHERE schemaname = 'public' ORDER BY 1;

-- Verificación 2: ninguna tabla sin RLS (0 filas).
SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND NOT rowsecurity;
