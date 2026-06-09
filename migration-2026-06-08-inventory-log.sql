-- Historial de cambios de stock global
-- Cada venta (reason='sale') y cada ajuste manual (reason='manual_set') queda registrado.

CREATE TABLE IF NOT EXISTS inventory_log (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  garment_type text       NOT NULL DEFAULT '',
  size        text        NOT NULL,
  color       text        NOT NULL,
  change_qty  integer     NOT NULL, -- negativo = decremento, positivo = incremento/ajuste
  reason      text        NOT NULL CHECK (reason IN ('sale', 'manual_set', 'manual_delete')),
  order_id    uuid        REFERENCES orders(id) ON DELETE SET NULL,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE inventory_log ENABLE ROW LEVEL SECURITY;

-- Solo service_role puede leer/escribir (el admin usa service_role key)
CREATE POLICY "service_role_all_inventory_log"
  ON inventory_log FOR ALL USING (true);

-- Índice para filtrar por fecha y prenda
CREATE INDEX IF NOT EXISTS inventory_log_created_at_idx ON inventory_log (created_at DESC);
CREATE INDEX IF NOT EXISTS inventory_log_garment_idx    ON inventory_log (garment_type, size, color);
