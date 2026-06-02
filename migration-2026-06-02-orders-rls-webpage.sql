-- =====================================================================
-- Migration: permitir que clientes autenticados de la webpage (Supabase Auth)
-- creen su propia orden y lean solo las suyas. El bot/server sigue usando
-- service_role (bypasea RLS), así que no toca nada de su flujo.
-- =====================================================================

BEGIN;

-- INSERT: cualquier usuario autenticado puede crear una orden que esté
-- asociada a su propio email. No permitimos pasar otro customer_email.
DROP POLICY IF EXISTS "Authenticated can insert their orders" ON orders;
CREATE POLICY "Authenticated can insert their orders"
  ON orders
  FOR INSERT
  TO authenticated
  WITH CHECK (customer_email = (auth.jwt() ->> 'email'));

-- SELECT: cada cliente autenticado solo ve sus propias órdenes. La policy
-- anon antigua ("Allow anon read orders") sigue activa para el dashboard
-- del operador (que usa la anon key directamente sin login). Si quieres
-- cerrar ese boquete después, dropea esa policy.
DROP POLICY IF EXISTS "Authenticated can read their orders" ON orders;
CREATE POLICY "Authenticated can read their orders"
  ON orders
  FOR SELECT
  TO authenticated
  USING (customer_email = (auth.jwt() ->> 'email'));

COMMIT;
