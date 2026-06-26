-- Add additional columns to bills table for enhanced bill information
ALTER TABLE public.bills 
ADD COLUMN IF NOT EXISTS gst VARCHAR(20),
ADD COLUMN IF NOT EXISTS invoice_date DATE,
ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(50);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_bills_gst ON public.bills(gst);
CREATE INDEX IF NOT EXISTS idx_bills_invoice_date ON public.bills(invoice_date);
CREATE INDEX IF NOT EXISTS idx_bills_invoice_number ON public.bills(invoice_number);

-- Update existing bills to set default values for new columns
UPDATE public.bills 
SET gst = NULL, 
    invoice_date = NULL, 
    invoice_number = NULL 
WHERE gst IS NULL AND invoice_date IS NULL AND invoice_number IS NULL;