-- =====================================================================
-- Migration: add `visual_tags` array to products so the bot can find
-- prints by their visual content (e.g. customer asks for "piña" and the
-- shirt has a pineapple illustration even when "piña" isn't anywhere in
-- the name or description).
--
-- Populate via POST /api/admin/tag-products (uses Claude vision on the
-- back image of each product).
-- =====================================================================

BEGIN;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS visual_tags TEXT[] DEFAULT '{}'::TEXT[];

-- GIN index for fast text-array searches.
CREATE INDEX IF NOT EXISTS idx_products_visual_tags
  ON products USING GIN (visual_tags);

COMMIT;
