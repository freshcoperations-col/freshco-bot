-- Freshco WhatsApp Agent — Schema Supabase
-- Ejecutar en el SQL Editor de Supabase

-- Tabla de mensajes
CREATE TABLE IF NOT EXISTS messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_phone text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  content text NOT NULL,
  intent text DEFAULT 'otro',
  whatsapp_message_id text UNIQUE,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Tabla de pedidos
CREATE TABLE IF NOT EXISTS orders (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_phone text NOT NULL,
  items jsonb NOT NULL DEFAULT '[]',
  total numeric NOT NULL DEFAULT 0,
  shipping_address text,
  payment_method text,
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS messages_customer_phone_idx ON messages(customer_phone);
CREATE INDEX IF NOT EXISTS messages_created_at_idx ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS messages_direction_idx ON messages(direction);
CREATE INDEX IF NOT EXISTS orders_customer_phone_idx ON orders(customer_phone);

-- Habilitar Realtime en la tabla messages (para el dashboard)
ALTER PUBLICATION supabase_realtime ADD TABLE messages;

-- RLS (Row Level Security) - permitir lectura anónima para el dashboard
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon read messages" ON messages
  FOR SELECT USING (true);

CREATE POLICY "Allow service role all messages" ON messages
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Allow anon read orders" ON orders
  FOR SELECT USING (true);

CREATE POLICY "Allow service role all orders" ON orders
  FOR ALL USING (auth.role() = 'service_role');
