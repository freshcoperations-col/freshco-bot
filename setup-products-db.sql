-- =====================================================================
-- Freshco — Product Catalog Schema (inline collections, no pivot)
-- Run this in the Supabase SQL editor after setup-db.sql
-- =====================================================================

-- ⚠️ DESTRUCTIVE: drops any pre-existing product tables to start clean.
-- Comment these out if you have data you want to preserve.
DROP VIEW  IF EXISTS products_full;
DROP TABLE IF EXISTS product_collections CASCADE;
DROP TABLE IF EXISTS products            CASCADE;
DROP TABLE IF EXISTS collections         CASCADE;
DROP TABLE IF EXISTS garment_types       CASCADE;

-- 1. Garment types (e.g. camisetas, pantalones, hoodies)
CREATE TABLE IF NOT EXISTS garment_types (
  id           TEXT PRIMARY KEY,                -- slug: 'camisetas'
  label        TEXT NOT NULL,                   -- 'Camisetas'
  image_url    TEXT,
  sort_order   INTEGER DEFAULT 0,
  active       BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Collections (transversal; one collection can span multiple garment types)
CREATE TABLE IF NOT EXISTS collections (
  id           TEXT PRIMARY KEY,                -- slug: 'todo-melo'
  label        TEXT NOT NULL,                   -- 'Todo Melo (O Eso Parece)'
  description  TEXT,
  image_url    TEXT,
  sort_order   INTEGER DEFAULT 0,
  active       BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Products — collections are stored inline as text[] (denormalized).
--    Simpler for a small catalog and avoids a pivot table.
CREATE TABLE IF NOT EXISTS products (
  id                TEXT PRIMARY KEY,            -- slug: 'modo-fresco'
  garment_type      TEXT NOT NULL REFERENCES garment_types(id) ON DELETE RESTRICT,
  collections       TEXT[] DEFAULT '{}',         -- ['todo-melo']
  name              TEXT NOT NULL,
  description       TEXT,
  price             NUMERIC(12,2) NOT NULL,
  sale_price        NUMERIC(12,2),               -- null when not on sale
  on_sale           BOOLEAN DEFAULT FALSE,
  stock             INTEGER DEFAULT 0,
  sizes             TEXT[] DEFAULT '{}',
  colors            TEXT[] DEFAULT '{}',
  material          TEXT,
  printing_method   TEXT,
  image_urls        TEXT[] DEFAULT '{}',         -- empty → autogen from name in Storage
  model_3d_url      TEXT,
  available         BOOLEAN DEFAULT TRUE,
  featured          BOOLEAN DEFAULT FALSE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Indexes for fast filtering
CREATE INDEX IF NOT EXISTS idx_products_garment_type ON products(garment_type);
CREATE INDEX IF NOT EXISTS idx_products_available    ON products(available);
CREATE INDEX IF NOT EXISTS idx_products_on_sale      ON products(on_sale);
CREATE INDEX IF NOT EXISTS idx_products_featured     ON products(featured);
CREATE INDEX IF NOT EXISTS idx_products_collections  ON products USING gin(collections);
CREATE INDEX IF NOT EXISTS idx_products_name_search  ON products USING gin(to_tsvector('spanish', name));

-- 5. Auto-update updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS products_updated_at ON products;
CREATE TRIGGER products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 6. View for easy querying — joins garment_type label and collection labels.
CREATE OR REPLACE VIEW products_full AS
SELECT
  p.*,
  gt.label AS garment_type_label,
  ARRAY(
    SELECT c.label FROM collections c WHERE c.id = ANY(p.collections)
  ) AS collection_labels
FROM products p
LEFT JOIN garment_types gt ON gt.id = p.garment_type;

-- =====================================================================
-- Seed data
-- =====================================================================

INSERT INTO garment_types (id, label, image_url, sort_order) VALUES
  ('camisetas', 'Camisetas', 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&q=80&w=800', 1),
  ('pantalones', 'Pantalones', NULL, 2),
  ('hoodies', 'Hoodies', NULL, 3)
ON CONFLICT (id) DO NOTHING;

INSERT INTO collections (id, label, description, sort_order) VALUES
  ('todo-melo', 'Todo Melo (O Eso Parece)', 'Camisetas oversize con humor, frescura y cero filtro.', 1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO products (id, garment_type, collections, name, description, price, stock, sizes, colors, image_urls, available, featured)
VALUES
  ('modo-fresco', 'camisetas', ARRAY['todo-melo'], 'Modo Fresco',
   'Para cuando la vida te exige demasiado y tú solo quieres existir en temperatura ambiente. Oversize, fresca y con 0% de estrés.',
   90000, 15, ARRAY['S','M','L','XL'], ARRAY['Blanco','Negro','Verde'], ARRAY[]::text[], TRUE, TRUE)
ON CONFLICT (id) DO NOTHING;
