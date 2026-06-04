-- =====================================================================
-- Migration: tabla size_guide
-- Gestiona tallas disponibles y medidas por tipo de prenda.
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS size_guide (
  garment_type  TEXT PRIMARY KEY REFERENCES garment_types(id) ON DELETE CASCADE,
  sizes         TEXT[]  NOT NULL DEFAULT '{}',
  -- measurements: [{label: 'Ancho pecho (cm)', values: {S: '48', M: '52', ...}}]
  measurements  JSONB   NOT NULL DEFAULT '[]',
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE size_guide ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon can read size_guide"
  ON size_guide FOR SELECT TO anon USING (TRUE);

CREATE POLICY "service_role full access size_guide"
  ON size_guide FOR ALL TO service_role
  USING (TRUE) WITH CHECK (TRUE);

-- Seed: datos iniciales por tipo de prenda
INSERT INTO size_guide (garment_type, sizes, measurements) VALUES
(
  'camisetas',
  ARRAY['XS','S','M','L','XL','XXL'],
  '[
    {"label":"Ancho pecho (cm)","values":{"XS":"44","S":"48","M":"52","L":"56","XL":"60","XXL":"64"}},
    {"label":"Largo total (cm)","values":{"XS":"68","S":"71","M":"74","L":"77","XL":"80","XXL":"83"}},
    {"label":"Hombro (cm)",      "values":{"XS":"41","S":"44","M":"47","L":"50","XL":"53","XXL":"56"}},
    {"label":"Manga (cm)",       "values":{"XS":"19","S":"21","M":"23","L":"25","XL":"27","XXL":"29"}}
  ]'::jsonb
),
('hoodies',    ARRAY['XS','S','M','L','XL','XXL'], '[]'::jsonb),
('sudaderas',  ARRAY['XS','S','M','L','XL','XXL'], '[]'::jsonb),
('chaquetas',  ARRAY['XS','S','M','L','XL','XXL'], '[]'::jsonb),
('gorras',     ARRAY['L/XL'],                      '[]'::jsonb),
('pantalones', ARRAY['28','30','32','34','36','38'],'[]'::jsonb)
ON CONFLICT (garment_type) DO NOTHING;

COMMIT;
