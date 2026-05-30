-- =====================================================================
-- Migration: add `reminder_sent_at` to orders so the abandoned-cart cron
-- can mark which orders have already been reminded and never spam twice.
--
-- Run AFTER migration-2026-05-29-orders-payments.sql.
-- =====================================================================

BEGIN;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_orders_pending_no_reminder
  ON orders(payment_status, created_at)
  WHERE payment_status = 'pending' AND reminder_sent_at IS NULL;

COMMIT;
