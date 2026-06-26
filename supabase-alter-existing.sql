-- =============================================
-- SUPABASE ALTER EXISTING DATABASE SCRIPT
-- Use this if you already have a database and just need to add missing columns
-- =============================================

-- Add missing columns to bills table
alter table public.bills 
    add column if not exists google_maps_link text,
    add column if not exists distance_km numeric(8,2),
    add column if not exists utr_number text,
    add column if not exists card_last_4 text,
    add column if not exists payment_slip_uri text,
    add column if not exists is_verified_payment boolean default false,
    add column if not exists payment_date text,
    add column if not exists match_confidence integer,
    add column if not exists match_method text;

-- Create bill_items table if it doesn't exist
create table if not exists public.bill_items (
    id uuid default uuid_generate_v4() primary key,
    bill_id uuid references bills on delete cascade not null,
    name text not null,
    quantity integer default 1,
    price numeric(12,2) not null,
    amount numeric(12,2) not null,
    created_at timestamptz default now() not null
);

-- Create index for bill_items
create index if not exists idx_bill_items_bill_id on public.bill_items(bill_id);

-- Enable RLS for bill_items
alter table public.bill_items enable row level security;

-- Drop existing policies first (safe) then recreate
drop policy if exists "Users can view their own bill items" on public.bill_items;
drop policy if exists "Users can insert their own bill items" on public.bill_items;
drop policy if exists "Users can update their own bill items" on public.bill_items;
drop policy if exists "Users can delete their own bill items" on public.bill_items;

-- Add RLS policies for bill_items
create policy "Users can view their own bill items"
    on public.bill_items
    for select
    using (
        exists (
            select 1 from bills
            where bills.id = bill_items.bill_id
            and bills.user_id = auth.uid()
        )
    );

create policy "Users can insert their own bill items"
    on public.bill_items
    for insert
    with check (
        exists (
            select 1 from bills
            where bills.id = bill_items.bill_id
            and bills.user_id = auth.uid()
        )
    );

create policy "Users can update their own bill items"
    on public.bill_items
    for update
    using (
        exists (
            select 1 from bills
            where bills.id = bill_items.bill_id
            and bills.user_id = auth.uid()
        )
    );

create policy "Users can delete their own bill items"
    on public.bill_items
    for delete
    using (
        exists (
            select 1 from bills
            where bills.id = bill_items.bill_id
            and bills.user_id = auth.uid()
        )
    );

-- =============================================
-- ALTER COMPLETE!
-- =============================================
