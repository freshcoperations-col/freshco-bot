-- =====================================================================
-- Migration: tabla coupons — gestión de cupones desde el admin.
-- Reemplaza los cupones hardcodeados en promotions.js de la webpage.
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS coupons (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code         TEXT NOT NULL UNIQUE,           -- 'BIENVENIDO20'
  discount     NUMERIC(4,2) NOT NULL           -- 0.20 = 20 %
                CHECK (discount > 0 AND discount <= 1),
  description  TEXT,                           -- 'Primera compra'
  active       BOOLEAN DEFAULT TRUE,
  usage_limit  INTEGER,                        -- NULL = ilimitado
  used_count   INTEGER DEFAULT 0,
  expires_at   TIMESTAMPTZ,                    -- NULL = sin expiración
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_coupons_code ON coupons(UPPER(code));

-- Seed: migrar los cupones hardcodeados actuales.
INSERT INTO coupons (code, discount, description, active)
VALUES
  ('BIENVENIDO20', 0.20, '20% de descuento — primera compra', TRUE),
  ('OVERS10',      0.10, '10% de descuento — 2 prendas o más',  TRUE)
ON CONFLICT (code) DO NOTHING;

-- RLS: el anon puede leer (para validar desde la webpage).
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon can read active coupons"
  ON coupons FOR SELECT TO anon
  USING (active = TRUE);

CREATE POLICY "service_role full access coupons"
  ON coupons FOR ALL TO service_role
  USING (TRUE) WITH CHECK (TRUE);

COMMIT;
