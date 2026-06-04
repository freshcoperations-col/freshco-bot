-- Agregar tipos de prenda nuevos
INSERT INTO garment_types (id, label, active, sort_order)
VALUES
  ('gorras',     'Gorras',     TRUE, 4),
  ('sudaderas',  'Sudaderas',  TRUE, 5),
  ('chaquetas',  'Chaquetas',  TRUE, 6)
ON CONFLICT (id) DO NOTHING;
