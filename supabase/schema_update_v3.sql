-- Add transaction-specific columns to bills table for payment merging intelligence
ALTER TABLE public.bills 
ADD COLUMN IF NOT EXISTS utr_number VARCHAR(100),
ADD COLUMN IF NOT EXISTS card_last_4 VARCHAR(4),
ADD COLUMN IF NOT EXISTS payment_slip_uri TEXT,
ADD COLUMN IF NOT EXISTS is_verified_payment BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS payment_timestamp TIMESTAMP WITH TIME ZONE;

-- Create index on UTR number for faster reconciliation
CREATE INDEX IF NOT EXISTS idx_bills_utr_number ON public.bills(utr_number);

-- Create index on amount and date for merging logic
CREATE INDEX IF NOT EXISTS idx_bills_merge_lookup ON public.bills(amount, created_at);
