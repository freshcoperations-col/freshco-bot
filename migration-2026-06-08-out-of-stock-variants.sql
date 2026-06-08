-- Agrega columnas para marcar tallas y colores agotados por producto.
-- Ejecutar en Supabase Dashboard → SQL Editor.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS out_of_stock_sizes text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS out_of_stock_colors text[] DEFAULT '{}';

-- Comentario: estos arrays contienen las tallas/colores agotados para ese producto.
-- Ejemplo: out_of_stock_sizes = '{"S","M"}', out_of_stock_colors = '{"Negro"}'
-- El admin los gestiona desde ProductForm → sección "Tallas agotadas" y el botón ! en colores.
-- La página web los lee desde products_full y los muestra como deshabilitados.
