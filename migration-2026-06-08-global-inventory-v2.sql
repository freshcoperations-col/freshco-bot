-- Rediseño del inventario global: de JSONB booleano a filas con cantidades reales.
-- Ejecutar en Supabase Dashboard → SQL Editor.
-- ATENCION: elimina la tabla antigua global_inventory y la recrea.

DROP TABLE IF EXISTS global_inventory CASCADE;

-- Una fila por combinación talla+color con cantidad disponible.
-- El stock baja automáticamente al confirmar un pago Wompi.
CREATE TABLE global_inventory (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  size        text NOT NULL,
  color       text NOT NULL,
  quantity    integer NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  updated_at  timestamptz DEFAULT now(),
  CONSTRAINT unique_size_color UNIQUE (size, color)
);

ALTER TABLE global_inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_global_inventory"
  ON global_inventory FOR SELECT USING (true);
CREATE POLICY "service_role_all_global_inventory"
  ON global_inventory FOR ALL USING (true);

-- Función para decrementar de forma atómica (evita race conditions en ventas simultáneas)
CREATE OR REPLACE FUNCTION decrement_global_inventory(p_size text, p_color text, p_qty int)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE global_inventory
  SET quantity   = GREATEST(0, quantity - p_qty),
      updated_at = now()
  WHERE size = p_size AND color = p_color;
$$;
