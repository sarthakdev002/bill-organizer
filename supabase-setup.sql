-- =============================================
-- SUPABASE COMPLETE SETUP SCRIPT
-- Bill Organizer Application
-- =============================================

-- 1. Enable necessary extensions
create extension if not exists "uuid-ossp";

-- 2. Create bills table
create table if not exists public.bills (
    id uuid default uuid_generate_v4() primary key,
    user_id uuid references auth.users not null,
    category text not null,
    amount numeric(12, 2) not null,
    merchant_name text,
    invoice_number text,
    invoice_date timestamptz,
    gst text,
    payment_mode text,
    payment_timestamp timestamptz,
    total_tax numeric(12, 2) default 0,
    cgst numeric(12, 2) default 0,
    sgst numeric(12, 2) default 0,
    igst numeric(12, 2) default 0,
    vendor_address text,
    uri text,
    google_maps_link text,
    distance_km numeric(8, 2),
    enrichment_data jsonb,
    utr_number text,
    card_last_4 text,
    payment_slip_uri text,
    is_verified_payment boolean default false,
    payment_date text,
    match_confidence integer,
    match_method text,
    created_at timestamptz default now() not null,
    updated_at timestamptz default now() not null
);

-- 3. Create bill_items table
create table if not exists public.bill_items (
    id uuid default uuid_generate_v4() primary key,
    bill_id uuid references bills on delete cascade not null,
    name text not null,
    quantity integer default 1,
    price numeric(12, 2) not null,
    amount numeric(12, 2) not null,
    created_at timestamptz default now() not null
);

-- 4. Create budgets table
create table if not exists public.budgets (
    id uuid default uuid_generate_v4() primary key,
    user_id uuid references auth.users not null,
    category text not null,
    amount numeric(12, 2) not null,
    start_date timestamptz,
    end_date timestamptz,
    created_at timestamptz default now() not null,
    updated_at timestamptz default now() not null,
    unique(user_id, category)
);

-- 5. Create budget_alerts table
create table if not exists public.budget_alerts (
    id uuid default uuid_generate_v4() primary key,
    user_id uuid references auth.users not null,
    budget_id uuid references budgets on delete cascade not null,
    threshold integer not null,
    triggered_at timestamptz default now() not null
);

-- 6. Create indexes for performance
create index if not exists idx_bills_user_id on public.bills(user_id);
create index if not exists idx_bills_created_at on public.bills(created_at desc);
create index if not exists idx_bills_category on public.bills(category);
create index if not exists idx_bill_items_bill_id on public.bill_items(bill_id);
create index if not exists idx_budgets_user_id on public.budgets(user_id);
create index if not exists idx_budgets_category on public.budgets(category);
create index if not exists idx_budget_alerts_user_id on public.budget_alerts(user_id);

-- 7. Enable Row Level Security (RLS)
alter table public.bills enable row level security;
alter table public.bill_items enable row level security;
alter table public.budgets enable row level security;
alter table public.budget_alerts enable row level security;

-- 8. Create RLS Policies for bills
create policy "Users can view their own bills"
    on public.bills
    for select
    using (auth.uid() = user_id);

create policy "Users can insert their own bills"
    on public.bills
    for insert
    with check (auth.uid() = user_id);

create policy "Users can update their own bills"
    on public.bills
    for update
    using (auth.uid() = user_id);

create policy "Users can delete their own bills"
    on public.bills
    for delete
    using (auth.uid() = user_id);

-- 9. Create RLS Policies for bill_items
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

-- 10. Create RLS Policies for budgets
create policy "Users can view their own budgets"
    on public.budgets
    for select
    using (auth.uid() = user_id);

create policy "Users can insert their own budgets"
    on public.budgets
    for insert
    with check (auth.uid() = user_id);

create policy "Users can update their own budgets"
    on public.budgets
    for update
    using (auth.uid() = user_id);

create policy "Users can delete their own budgets"
    on public.budgets
    for delete
    using (auth.uid() = user_id);

-- 11. Create RLS Policies for budget_alerts
create policy "Users can view their own budget alerts"
    on public.budget_alerts
    for select
    using (auth.uid() = user_id);

create policy "Users can insert their own budget alerts"
    on public.budget_alerts
    for insert
    with check (auth.uid() = user_id);

create policy "Users can update their own budget alerts"
    on public.budget_alerts
    for update
    using (auth.uid() = user_id);

create policy "Users can delete their own budget alerts"
    on public.budget_alerts
    for delete
    using (auth.uid() = user_id);

-- 12. Create updated_at trigger function
create or replace function public.handle_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

-- 13. Add triggers for updated_at
create trigger set_bills_updated_at
    before update on public.bills
    for each row
    execute function public.handle_updated_at();

create trigger set_budgets_updated_at
    before update on public.budgets
    for each row
    execute function public.handle_updated_at();

-- 14. Enable realtime
begin;
    drop publication if exists supabase_realtime;
    create publication supabase_realtime;
commit;

alter publication supabase_realtime add table public.bills;
alter publication supabase_realtime add table public.budgets;

-- 15. Create storage bucket for receipts if needed (optional)
-- insert into storage.buckets (id, name, public)
-- values ('receipts', 'receipts', false)
-- on conflict (id) do nothing;

-- create policy "Users can view their own receipts"
--     on storage.objects
--     for select
--     using (auth.uid()::text = (storage.foldername(name))[1]);

-- create policy "Users can upload their own receipts"
--     on storage.objects
--     for insert
--     with check (auth.uid()::text = (storage.foldername(name))[1]);

-- create policy "Users can update their own receipts"
--     on storage.objects
--     for update
--     using (auth.uid()::text = (storage.foldername(name))[1]);

-- create policy "Users can delete their own receipts"
--     on storage.objects
--     for delete
--     using (auth.uid()::text = (storage.foldername(name))[1]);

-- =============================================
-- SETUP COMPLETE!
-- =============================================
-- Next steps:
-- 1. Go to your Supabase dashboard -> SQL Editor
-- 2. Paste and run this entire script
-- 3. Your database is ready to use!
-- =============================================
