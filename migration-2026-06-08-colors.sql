-- Catálogo de colores de Freshco con su valor hex para mostrarse como swatches.
-- Ejecutar en Supabase Dashboard → SQL Editor.

CREATE TABLE IF NOT EXISTS colors (
  id          text PRIMARY KEY,          -- slug: 'vainilla', 'negro-intenso'
  name        text NOT NULL,             -- nombre visible: 'Vainilla', 'Negro Intenso'
  hex         text NOT NULL DEFAULT '#cccccc',
  sort_order  int DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE colors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_colors" ON colors FOR SELECT USING (true);
CREATE POLICY "service_role_all_colors" ON colors FOR ALL USING (true);

-- Color inicial ya existente
INSERT INTO colors (id, name, hex, sort_order) VALUES
  ('vainilla', 'Vainilla', '#EFE6D2', 0)
ON CONFLICT (id) DO NOTHING;
