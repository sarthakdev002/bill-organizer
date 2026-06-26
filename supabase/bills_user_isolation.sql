-- Add user_id column to bills table
ALTER TABLE public.bills 
ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Update existing bills to have a user_id (if any exist, they'll be assigned to the first user)
-- This is a fallback - in practice, we should migrate data properly or start fresh
UPDATE public.bills 
SET user_id = (SELECT id FROM auth.users LIMIT 1) 
WHERE user_id IS NULL;

-- Make user_id required for new bills
ALTER TABLE public.bills 
ALTER COLUMN user_id SET NOT NULL;

-- Enable Row Level Security on bills table
ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;

-- Create policy: users can only see their own bills
CREATE POLICY "Users can view only their own bills" ON public.bills
  FOR SELECT USING (auth.uid() = user_id);

-- Create policy: users can only insert their own bills
CREATE POLICY "Users can insert only their own bills" ON public.bills
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Create policy: users can only update their own bills
CREATE POLICY "Users can update only their own bills" ON public.bills
  FOR UPDATE USING (auth.uid() = user_id);

-- Create policy: users can only delete their own bills
CREATE POLICY "Users can delete only their own bills" ON public.bills
  FOR DELETE USING (auth.uid() = user_id);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_bills_user_id ON public.bills(user_id);
CREATE INDEX IF NOT EXISTS idx_bills_user_category ON public.bills(user_id, category);
CREATE INDEX IF NOT EXISTS idx_bills_user_created_at ON public.bills(user_id, created_at);