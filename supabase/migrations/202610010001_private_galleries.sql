create extension if not exists pgcrypto;

create type public.gallery_status as enum ('open', 'closed');
create type public.gallery_type as enum ('event', 'individual');
create type public.gallery_order_status as enum (
  'pending_payment',
  'paid_to_prepare',
  'sent',
  'cancelled_refunded'
);

create table public.galleries (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type public.gallery_type not null,
  status public.gallery_status not null default 'open',
  access_code_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  check (length(name) between 1 and 160),
  check (access_code_hash ~ '^[0-9a-f]{64}$')
);

create table public.gallery_photos (
  id uuid primary key default gen_random_uuid(),
  gallery_id uuid not null references public.galleries(id) on delete restrict,
  photo_number integer not null check (photo_number > 0),
  preview_path text not null,
  original_path text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (gallery_id, photo_number),
  unique (gallery_id, id)
);

create table public.gallery_settings (
  id smallint primary key default 1 check (id = 1),
  unit_price_cents integer not null check (unit_price_cents > 0),
  currency char(3) not null default 'eur' check (currency = 'eur'),
  updated_at timestamptz not null default now()
);

create table public.gallery_discount_tiers (
  min_photos integer primary key check (min_photos > 0),
  discount_bps integer not null check (discount_bps between 0 and 10000)
);

create table public.gallery_orders (
  id uuid primary key default gen_random_uuid(),
  gallery_id uuid not null references public.galleries(id) on delete restrict,
  customer_email text not null,
  status public.gallery_order_status not null default 'pending_payment',
  currency char(3) not null default 'eur' check (currency = 'eur'),
  subtotal_cents integer not null check (subtotal_cents >= 0),
  discount_bps integer not null check (discount_bps between 0 and 10000),
  discount_cents integer not null check (discount_cents >= 0),
  total_cents integer not null check (total_cents >= 0),
  stripe_checkout_session_id text unique,
  paid_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (total_cents = subtotal_cents - discount_cents)
);

create table public.gallery_order_photos (
  order_id uuid not null references public.gallery_orders(id) on delete restrict,
  photo_id uuid not null references public.gallery_photos(id) on delete restrict,
  photo_number integer not null,
  unit_price_cents integer not null check (unit_price_cents > 0),
  primary key (order_id, photo_id)
);

create table public.gallery_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.gallery_rate_limits (
  attempt_key text primary key check (attempt_key ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null,
  attempts integer not null check (attempts > 0)
);

create index gallery_photos_gallery_active_idx
  on public.gallery_photos (gallery_id, photo_number) where is_active;
create index gallery_orders_status_created_idx
  on public.gallery_orders (status, created_at desc);
create index gallery_orders_gallery_created_idx
  on public.gallery_orders (gallery_id, created_at desc);

insert into public.gallery_settings (id, unit_price_cents)
values (1, 500);

insert into public.gallery_discount_tiers (min_photos, discount_bps)
values (1, 0), (5, 2000), (10, 2500), (15, 3000);

alter table public.galleries enable row level security;
alter table public.gallery_photos enable row level security;
alter table public.gallery_settings enable row level security;
alter table public.gallery_discount_tiers enable row level security;
alter table public.gallery_orders enable row level security;
alter table public.gallery_order_photos enable row level security;
alter table public.gallery_admins enable row level security;
alter table public.gallery_rate_limits enable row level security;

revoke all on public.galleries, public.gallery_photos, public.gallery_settings,
  public.gallery_discount_tiers, public.gallery_orders, public.gallery_order_photos,
  public.gallery_admins, public.gallery_rate_limits from anon, authenticated;

create or replace function public.consume_gallery_rate_limit(p_key text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  current_attempts integer;
begin
  insert into public.gallery_rate_limits (attempt_key, window_started_at, attempts)
  values (p_key, now(), 1)
  on conflict (attempt_key) do update
    set window_started_at = case
          when gallery_rate_limits.window_started_at < now() - interval '15 minutes'
            then now()
          else gallery_rate_limits.window_started_at
        end,
        attempts = case
          when gallery_rate_limits.window_started_at < now() - interval '15 minutes'
            then 1
          else gallery_rate_limits.attempts + 1
        end
  returning attempts into current_attempts;

  delete from public.gallery_rate_limits
  where window_started_at < now() - interval '1 day';

  return current_attempts;
end;
$$;

revoke all on function public.consume_gallery_rate_limit(text) from public, anon, authenticated;
grant execute on function public.consume_gallery_rate_limit(text) to service_role;

insert into storage.buckets (id, name, public)
values ('gallery-previews', 'gallery-previews', false),
       ('gallery-originals', 'gallery-originals', false)
on conflict (id) do update set public = false;

update storage.buckets
set file_size_limit = 52428800,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id in ('gallery-previews', 'gallery-originals');
