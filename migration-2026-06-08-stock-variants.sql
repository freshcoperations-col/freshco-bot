-- Stock por talla+color: inventario detallado por variante.
-- Ejecutar en Supabase Dashboard → SQL Editor.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS stock_variants jsonb NOT NULL DEFAULT '[]';

-- Formato: [{"size": "S", "color": "Negro", "quantity": 10}, ...]
-- Si color es null → producto sin variante de color (prenda única).
-- Si size es null → producto sin talla definida.
-- El campo products.stock se mantiene como TOTAL (suma de todas las variantes).
-- Se actualiza automáticamente al guardar desde el admin o al confirmar un pago.
