-- =====================================================================
-- Migration: extend `orders` with Wompi payment fields so the bot can
-- (a) generate a payment link, (b) track its status, and (c) update
-- the row when the Wompi webhook posts a transaction event.
--
-- Run AFTER setup-db.sql in the Supabase SQL editor.
-- =====================================================================

BEGIN;

-- 1. Payment-related columns.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS wompi_reference     TEXT,
  ADD COLUMN IF NOT EXISTS wompi_transaction_id TEXT,
  ADD COLUMN IF NOT EXISTS payment_status      TEXT NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending', 'approved', 'declined', 'voided', 'error')),
  ADD COLUMN IF NOT EXISTS payment_link_url    TEXT,
  ADD COLUMN IF NOT EXISTS amount_in_cents     BIGINT,
  ADD COLUMN IF NOT EXISTS currency            TEXT DEFAULT 'COP',
  ADD COLUMN IF NOT EXISTS paid_at             TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS customer_name       TEXT,
  ADD COLUMN IF NOT EXISTS customer_email      TEXT,
  ADD COLUMN IF NOT EXISTS source              TEXT NOT NULL DEFAULT 'whatsapp_bot'
    CHECK (source IN ('whatsapp_bot', 'webpage'));

-- 2. Indexes — the webhook hits us by reference or transaction id.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_orders_wompi_reference
  ON orders(wompi_reference) WHERE wompi_reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_payment_status
  ON orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_wompi_transaction
  ON orders(wompi_transaction_id) WHERE wompi_transaction_id IS NOT NULL;

COMMIT;
