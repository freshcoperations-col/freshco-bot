-- =====================================================================
-- Migration: tabla auth_otps para verificar el teléfono de un cliente y
-- "reclamar" en /profile las órdenes hechas por el bot con ese phone.
--
-- Flujo:
--   1. Cliente logueado en la web pone su teléfono → POST /api/auth/send-otp
--      → bot guarda código, lo manda por WhatsApp.
--   2. Cliente pega el código → POST /api/auth/verify-otp
--      → backfill: UPDATE orders SET customer_email = <su email>
--                  WHERE customer_phone = <phone> AND
--                        (customer_email IS NULL OR customer_email != <su email>).
--
-- RLS no se necesita acá porque ambos endpoints corren en el bot con
-- service_role.
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS auth_otps (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone       TEXT NOT NULL,
  code        TEXT NOT NULL,
  email       TEXT,                 -- email que está reclamando (opcional, solo para auditoría)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  attempts    INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_auth_otps_phone_created
  ON auth_otps(phone, created_at DESC);

COMMIT;
