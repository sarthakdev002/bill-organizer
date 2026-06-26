-- ============================================================
-- Payment Matching System - Schema Migration v4
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- 1. Add payment matching columns to bills table
ALTER TABLE public.bills
  ADD COLUMN IF NOT EXISTS payment_date DATE,
  ADD COLUMN IF NOT EXISTS match_confidence NUMERIC(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS match_method VARCHAR(20) DEFAULT NULL;
-- match_method values: 'ocr_auto', 'ocr_manual', 'webhook', 'manual'

-- 2. Composite index for fast time+amount lookups (core matching query)
CREATE INDEX IF NOT EXISTS idx_bills_payment_match
  ON public.bills(user_id, amount, created_at)
  WHERE utr_number IS NULL;

-- 3. Index for date-scoped payment queries
CREATE INDEX IF NOT EXISTS idx_bills_payment_date
  ON public.bills(user_id, payment_date)
  WHERE payment_date IS NOT NULL;

-- 4. Payment Reconciliations audit table
-- Logs every match attempt — who matched what, when, how confident
CREATE TABLE IF NOT EXISTS public.payment_reconciliations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id          BIGINT REFERENCES public.bills(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL,
  matched_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  match_method     VARCHAR(20) NOT NULL,  -- 'ocr_auto','ocr_manual','webhook','manual'
  match_confidence NUMERIC(5,2) NOT NULL,
  payment_amount   NUMERIC(12,2) NOT NULL,
  utr_number       VARCHAR(100),
  payment_mode     VARCHAR(50),
  payment_timestamp TIMESTAMP WITH TIME ZONE,
  razorpay_order_id VARCHAR(100),
  razorpay_payment_id VARCHAR(100),
  webhook_event    VARCHAR(100),
  raw_payload      JSONB,                 -- full OCR/webhook data for debugging
  created_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Indexes on reconciliation table
CREATE INDEX IF NOT EXISTS idx_reconciliations_bill_id
  ON public.payment_reconciliations(bill_id);

CREATE INDEX IF NOT EXISTS idx_reconciliations_user_id
  ON public.payment_reconciliations(user_id, matched_at DESC);

CREATE INDEX IF NOT EXISTS idx_reconciliations_utr
  ON public.payment_reconciliations(utr_number)
  WHERE utr_number IS NOT NULL;

-- 6. Row Level Security for reconciliations (users can only see their own)
ALTER TABLE public.payment_reconciliations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own reconciliations" ON public.payment_reconciliations;
CREATE POLICY "Users can view own reconciliations"
  ON public.payment_reconciliations FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own reconciliations" ON public.payment_reconciliations;
CREATE POLICY "Users can insert own reconciliations"
  ON public.payment_reconciliations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- Done. Check supabase dashboard to verify all columns added.
-- ============================================================
