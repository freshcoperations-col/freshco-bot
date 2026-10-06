-- =====================================================================
-- Migration: cupones a prueba de abuso + freno de intentos
--
-- Hallazgos de la prueba de seguridad (2026-10-05):
--   1. BIENVENIDO20 ("primera compra") se aceptó en una segunda compra. La
--      regla "uno por cliente" sí funcionaba; lo que no existía era la regla
--      "solo primera compra".
--   2. Dos pedidos simultáneos con el mismo cupón podían pasar los dos: la
--      verificación y el registro del uso eran pasos separados.
--   3. /api/coupons/validate no tenía freno: se podían adivinar códigos.
--
-- Cambios:
--   · coupons.first_purchase_only: el cupón solo vale si el cliente (por
--     correo o por teléfono) no tiene compras previas (pagadas o
--     contraentrega, no canceladas).
--   · claim_coupon(): verifica TODAS las reglas y registra el uso en un solo
--     paso, con el cupón bloqueado mientras tanto. Dos pedidos a la vez no
--     pueden usar el mismo cupón de un solo uso.
--   · release_coupon(): devuelve el uso si el pedido no se pudo crear.
--   · rate_limit_hit(): freno genérico de intentos por clave (IP, usuario…).
--
-- Ejecutar en Supabase Dashboard → SQL Editor, en el proyecto WEB, ANTES de
-- desplegar el código que llama estas funciones.
-- =====================================================================

BEGIN;

ALTER TABLE coupons ADD COLUMN IF NOT EXISTS first_purchase_only boolean NOT NULL DEFAULT false;
UPDATE coupons SET first_purchase_only = true, one_per_customer = true
WHERE code IN ('BIENVENIDO20', 'BIENVENIDA-FRESHCO');

-- ¿Este cliente ya compró? Correo o teléfono, pedidos pagados o contraentrega
-- que no estén cancelados.
CREATE OR REPLACE FUNCTION public.customer_has_purchases(p_email text, p_phone text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM orders o
    WHERE o.payment_status IN ('approved', 'cod')
      AND coalesce(o.status, '') NOT IN ('cancelado', 'cancelled')
      AND (
        (p_email IS NOT NULL AND lower(o.customer_email) = lower(p_email))
        OR (p_phone IS NOT NULL AND o.customer_phone = p_phone)
      )
  )
$$;

-- Reserva un uso del cupón para este cliente. Devuelve el id del uso, o lanza
-- un error con el motivo (el mensaje se le muestra al cliente).
CREATE OR REPLACE FUNCTION public.claim_coupon(p_code text, p_email text, p_phone text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c coupons%ROWTYPE;
  v_email text := nullif(lower(trim(p_email)), '');
  v_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), '');
  v_use uuid;
BEGIN
  -- FOR UPDATE: un segundo pedido con el mismo cupón espera aquí hasta que
  -- el primero termine, y entonces ya ve su uso registrado.
  SELECT * INTO c FROM coupons WHERE upper(code) = upper(trim(p_code)) FOR UPDATE;

  IF NOT FOUND OR NOT c.active THEN
    RAISE EXCEPTION 'Código no válido o inactivo' USING ERRCODE = 'P0001';
  END IF;
  IF c.expires_at IS NOT NULL AND c.expires_at < now() THEN
    RAISE EXCEPTION 'Este código ya expiró' USING ERRCODE = 'P0001';
  END IF;
  IF c.usage_limit IS NOT NULL AND c.used_count >= c.usage_limit THEN
    RAISE EXCEPTION 'Este código ya alcanzó su límite de usos' USING ERRCODE = 'P0001';
  END IF;
  IF (c.one_per_customer OR c.first_purchase_only) AND v_email IS NULL AND v_phone IS NULL THEN
    RAISE EXCEPTION 'Para usar este código necesitamos tu correo o teléfono' USING ERRCODE = 'P0001';
  END IF;
  IF c.one_per_customer AND EXISTS (
    SELECT 1 FROM coupon_uses u
    WHERE u.coupon_id = c.id
      AND ((v_email IS NOT NULL AND lower(u.customer_email) = v_email)
        OR (v_phone IS NOT NULL AND u.customer_phone = v_phone))
  ) THEN
    RAISE EXCEPTION 'Este código es de un solo uso por cliente y ya lo usaste.' USING ERRCODE = 'P0001';
  END IF;
  IF c.first_purchase_only AND customer_has_purchases(v_email, v_phone) THEN
    RAISE EXCEPTION 'Este código es solo para la primera compra.' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO coupon_uses (coupon_id, customer_email, customer_phone)
  VALUES (c.id, v_email, v_phone)
  RETURNING id INTO v_use;
  UPDATE coupons SET used_count = used_count + 1 WHERE id = c.id;
  RETURN v_use;
END $$;

-- Si el pedido no se pudo crear, el uso reservado se devuelve.
CREATE OR REPLACE FUNCTION public.release_coupon(p_use_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_coupon uuid;
BEGIN
  DELETE FROM coupon_uses WHERE id = p_use_id AND order_id IS NULL RETURNING coupon_id INTO v_coupon;
  IF v_coupon IS NOT NULL THEN
    UPDATE coupons SET used_count = greatest(0, used_count - 1) WHERE id = v_coupon;
  END IF;
END $$;

-- Freno de intentos: ventana fija por clave. Devuelve true si se permite.
CREATE TABLE IF NOT EXISTS api_rate_limits (
  key          text        PRIMARY KEY,
  window_start timestamptz NOT NULL DEFAULT now(),
  hits         int         NOT NULL DEFAULT 0
);
ALTER TABLE api_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.rate_limit_hit(p_key text, p_max int, p_window_seconds int)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_hits int;
BEGIN
  INSERT INTO api_rate_limits AS r (key, window_start, hits)
  VALUES (p_key, now(), 1)
  ON CONFLICT (key) DO UPDATE SET
    hits         = CASE WHEN r.window_start < now() - make_interval(secs => p_window_seconds) THEN 1 ELSE r.hits + 1 END,
    window_start = CASE WHEN r.window_start < now() - make_interval(secs => p_window_seconds) THEN now() ELSE r.window_start END
  RETURNING hits INTO v_hits;
  RETURN v_hits <= p_max;
END $$;

-- Solo el bot (service_role) ejecuta estas funciones.
REVOKE EXECUTE ON FUNCTION public.customer_has_purchases(text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_coupon(text, text, text)    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.release_coupon(uuid)              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rate_limit_hit(text, int, int)    FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.customer_has_purchases(text, text) TO service_role;
GRANT  EXECUTE ON FUNCTION public.claim_coupon(text, text, text)    TO service_role;
GRANT  EXECUTE ON FUNCTION public.release_coupon(uuid)              TO service_role;
GRANT  EXECUTE ON FUNCTION public.rate_limit_hit(text, int, int)    TO service_role;

COMMIT;

-- Verificación: los dos cupones de bienvenida quedan como primera compra.
SELECT code, active, one_per_customer, first_purchase_only FROM coupons ORDER BY code;
