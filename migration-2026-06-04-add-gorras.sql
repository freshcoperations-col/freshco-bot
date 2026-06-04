-- Agregar tipo de prenda "Gorras"
INSERT INTO garment_types (label, active, sort_order)
VALUES ('Gorras', TRUE, 4)
ON CONFLICT DO NOTHING;
