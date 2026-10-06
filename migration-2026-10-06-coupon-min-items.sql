-- =====================================================================
-- Migration: mínimo de prendas por cupón
--
-- OVERS10 dice "2 prendas o más", pero eso solo estaba en la descripción:
-- el sistema lo aplicaba con 1 prenda. Ahora es una regla que el servidor
-- hace cumplir (lib/coupons.ts → checkCoupon, llamado desde lib/pricing.ts).
--
-- Ejecutar en Supabase Dashboard → SQL Editor, en el proyecto WEB, ANTES de
-- desplegar el código que lee min_items.
-- =====================================================================

BEGIN;

ALTER TABLE coupons ADD COLUMN IF NOT EXISTS min_items int CHECK (min_items IS NULL OR min_items >= 1);
UPDATE coupons SET min_items = 2 WHERE code = 'OVERS10';

COMMIT;

SELECT code, min_items, one_per_customer, first_purchase_only FROM coupons ORDER BY code;
