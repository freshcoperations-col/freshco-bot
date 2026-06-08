-- Agrega tipo de prenda al inventario global para separar camisetas de pantalones etc.
-- Ejecutar en Supabase Dashboard → SQL Editor DESPUÉS de haber corrido migration-2026-06-08-global-inventory-v2.sql

-- 1. Agregar columna (vacía = aplica a todos los tipos, por compatibilidad con entradas existentes)
ALTER TABLE global_inventory
  ADD COLUMN IF NOT EXISTS garment_type text NOT NULL DEFAULT '';

-- 2. Reemplazar constraint única para incluir garment_type
ALTER TABLE global_inventory DROP CONSTRAINT IF EXISTS unique_size_color;
ALTER TABLE global_inventory
  ADD CONSTRAINT unique_garment_size_color UNIQUE (garment_type, size, color);

-- 3. Reemplazar función de decremento para incluir garment_type
DROP FUNCTION IF EXISTS decrement_global_inventory(text, text, int);

CREATE OR REPLACE FUNCTION decrement_global_inventory(
  p_garment_type text,
  p_size         text,
  p_color        text,
  p_qty          int
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE global_inventory
  SET quantity   = GREATEST(0, quantity - p_qty),
      updated_at = now()
  WHERE garment_type = p_garment_type
    AND size         = p_size
    AND color        = p_color;
$$;
