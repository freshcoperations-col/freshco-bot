-- Agregar tipo de prenda "Gorras"
INSERT INTO garment_types (id, label, active, sort_order)
VALUES ('gorras', 'Gorras', TRUE, 4)
ON CONFLICT (id) DO NOTHING;
