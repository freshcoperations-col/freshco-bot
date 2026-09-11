-- =====================================================================
-- Fix: una venta no puede DESMARCAR un "Agotado" puesto a mano
--
-- apply_product_stock recalculaba out_of_stock desde el stock en cada venta:
--
--   out_of_stock = (nuevo_total = 0)
--
-- El problema: el toggle "Agotado" del admin es un override manual para
-- esconder un producto que SÍ tiene stock (ej. ritmo-interno con stock 15
-- marcado como agotado). Con la fórmula de arriba, la primera venta de ese
-- producto lo volvía a publicar solo, deshaciendo la decisión del operador.
--
-- Regla correcta: una venta puede marcar agotado (cuando llega a 0), pero
-- nunca desmarcarlo. Quitar el "Agotado" es siempre una acción explícita
-- desde el admin (el toggle del listado, o guardar el producto).
--
-- Ejecutar en Supabase Dashboard → SQL Editor.
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION apply_product_stock(
  p_product_id text,
  p_size       text,
  p_color      text,
  p_qty        int
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_mode     text;
  v_variants jsonb;
  v_out      jsonb := '[]'::jsonb;
  v_elem     jsonb;
  v_qty      int;
  v_total    int := 0;
BEGIN
  SELECT stock_mode, coalesce(stock_variants, '[]'::jsonb)
    INTO v_mode, v_variants
    FROM products
   WHERE id = p_product_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_mode = 'variantes' THEN
    FOR v_elem IN SELECT * FROM jsonb_array_elements(v_variants) LOOP
      IF (v_elem ->> 'size')  IS NOT DISTINCT FROM nullif(p_size, '')
     AND (v_elem ->> 'color') IS NOT DISTINCT FROM nullif(p_color, '') THEN
        v_qty  := greatest(0, coalesce((v_elem ->> 'quantity')::int, 0) - p_qty);
        v_elem := jsonb_set(v_elem, '{quantity}', to_jsonb(v_qty));
      ELSE
        v_qty := coalesce((v_elem ->> 'quantity')::int, 0);
      END IF;
      v_total := v_total + v_qty;
      v_out   := v_out || v_elem;
    END LOOP;

    UPDATE products
       SET stock_variants = v_out,
           stock          = v_total,
           -- Solo enciende el flag; nunca lo apaga.
           out_of_stock   = CASE WHEN v_total = 0 THEN true ELSE out_of_stock END
     WHERE id = p_product_id;
  ELSE
    UPDATE products
       SET stock        = greatest(0, stock - p_qty),
           out_of_stock  = CASE WHEN greatest(0, stock - p_qty) = 0
                                THEN true
                                ELSE out_of_stock
                           END
     WHERE id = p_product_id;
  END IF;
END;
$$;

COMMIT;

-- Verificación: los productos marcados agotado a mano y con stock > 0
-- deben seguir marcados después de la próxima venta.
SELECT id, name, stock, stock_mode, out_of_stock
FROM products
WHERE out_of_stock = true AND stock > 0;
