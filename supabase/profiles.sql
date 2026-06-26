-- Create a profiles table linked to auth.users
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  full_name text,
  avatar_url text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Row Level Security
alter table public.profiles enable row level security;

-- Allow users to select their own profile
create policy "Profiles are viewable by owners" on public.profiles
  for select using (auth.uid() = id);

-- Allow users to update their own profile
create policy "Profiles are updatable by owners" on public.profiles
  for update using (auth.uid() = id);

-- Trigger to create a profile when a new user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute procedure public.handle_new_user();
