-- =====================================================================
-- Migration: prueba de la autorización de tratamiento de datos (Ley 1581)
--
-- La ley exige poder PROBAR que el cliente autorizó el tratamiento de sus
-- datos (Decreto 1377 de 2013, art. 8). Cada pedido guarda cuándo, por qué
-- canal y qué versión de la política aceptó.
--   · web      → marcó la casilla en el checkout
--   · whatsapp → dio sus datos después de que el bot le compartió la política
--   · admin    → pedido creado a mano por el equipo (sin autorización en línea)
--
-- Ejecutar en Supabase Dashboard → SQL Editor, en el proyecto WEB, ANTES de
-- desplegar el código que escribe estas columnas.
-- =====================================================================

BEGIN;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS privacy_consent_at      timestamptz,
  ADD COLUMN IF NOT EXISTS privacy_consent_channel text,
  ADD COLUMN IF NOT EXISTS privacy_policy_version  text;

COMMIT;

SELECT column_name FROM information_schema.columns
WHERE table_name = 'orders' AND column_name LIKE 'privacy_%' ORDER BY 1;
