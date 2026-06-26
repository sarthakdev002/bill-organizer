-- =============================================
-- SUPABASE COMPLETE RESET SCRIPT
-- Bill Organizer Application
-- USE WITH CAUTION - DELETES ALL DATA!
-- =============================================

-- 1. Disable realtime temporarily
drop publication if exists supabase_realtime;

-- 2. Drop triggers
drop trigger if exists set_bills_updated_at on public.bills;
drop trigger if exists set_budgets_updated_at on public.budgets;

-- 3. Drop tables (with cascade to remove dependencies)
drop table if exists public.budget_alerts cascade;
drop table if exists public.budgets cascade;
drop table if exists public.bills cascade;

-- 4. Drop trigger function
drop function if exists public.handle_updated_at();

-- 5. Optional: Remove storage bucket if exists
-- delete from storage.objects where bucket_id = 'receipts';
-- delete from storage.buckets where id = 'receipts';

-- =============================================
-- RESET COMPLETE!
-- =============================================
-- After running this, you can run supabase-setup.sql
-- to recreate all tables and policies.
-- =============================================
