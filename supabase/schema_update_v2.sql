-- Add enrichment and tax columns to bills table
ALTER TABLE public.bills 
ADD COLUMN IF NOT EXISTS vendor_address TEXT,
ADD COLUMN IF NOT EXISTS payment_mode VARCHAR(50),
ADD COLUMN IF NOT EXISTS cgst DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS sgst DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS igst DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_tax DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS vendor_gstin VARCHAR(15),
ADD COLUMN IF NOT EXISTS distance_km DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS google_maps_link TEXT,
ADD COLUMN IF NOT EXISTS enrichment_data JSONB DEFAULT '{}'::jsonb;

-- Create bill_items table for line-level details
CREATE TABLE IF NOT EXISTS public.bill_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bill_id UUID REFERENCES public.bills(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    quantity DECIMAL(10,2) DEFAULT 1,
    price DECIMAL(10,2) DEFAULT 0,
    amount DECIMAL(10,2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on bill_items
ALTER TABLE public.bill_items ENABLE ROW LEVEL SECURITY;

-- Policy for bill_items (similar to bills, assuming user isolation is handled via bill_id)
-- Note: You might need to adjust based on your specific RLS setup for bills
CREATE POLICY "Users can manage items for their own bills" ON public.bill_items
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.bills 
            WHERE bills.id = bill_items.bill_id 
            AND bills.user_id = auth.uid()
        )
    );

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_bill_items_bill_id ON public.bill_items(bill_id);
