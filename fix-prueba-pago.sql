-- Limpiar imágenes del producto de prueba y ocultarlo
UPDATE products
SET images = '[]'::jsonb,
    available = false
WHERE id = 'prueba-pago';
