-- Stock global: tallas+colores agotados que aplican a TODOS los productos.
-- Ejecutar en Supabase Dashboard → SQL Editor.

CREATE TABLE IF NOT EXISTS global_inventory (
  id int PRIMARY KEY DEFAULT 1,
  out_of_stock jsonb NOT NULL DEFAULT '[]'
  -- Formato: [{"size": "S", "color": "Negro"}, {"size": "M", "color": "Negro"}]
  -- Si size es null → ese color está agotado en TODAS las tallas.
  -- Si color es null → esa talla está agotada en TODOS los colores.
);

-- Fila inicial vacía
INSERT INTO global_inventory (id, out_of_stock)
VALUES (1, '[]')
ON CONFLICT (id) DO NOTHING;

-- RLS: admins pueden leer y escribir; público solo puede leer
ALTER TABLE global_inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_global_inventory"
  ON global_inventory FOR SELECT USING (true);

CREATE POLICY "service_role_all_global_inventory"
  ON global_inventory FOR ALL USING (true);
