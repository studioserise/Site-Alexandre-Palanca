-- Module de gestion commerciale : clients, prestations, devis, factures, règlements.
-- Toutes les tables sont privées : seules les fonctions serveur (clé service) y accèdent.

create table public.commerce_settings (
  id smallint primary key default 1 check (id = 1),
  legal_name text not null default 'Alexandre Palanca',
  trade_name text not null default 'Alexandre Palanca — Photographe & vidéaste',
  siren text not null default '',
  address text not null default '',
  postal_code text not null default '',
  city text not null default '',
  email text not null default 'info@alexandrepalanca.fr',
  phone text not null default '+33 6 79 53 82 80',
  iban text not null default '',
  vat_mention text not null default '',
  legal_footer text not null default '',
  default_payment_terms text not null default 'Paiement par virement bancaire. Acompte à la signature, solde à la livraison.',
  default_cancellation_terms text not null default '',
  default_delivery_terms text not null default '',
  default_usage_terms text not null default '',
  default_validity_days integer not null default 30 check (default_validity_days between 1 and 365),
  default_deposit_bps integer not null default 3000 check (default_deposit_bps between 0 and 10000),
  invoice_payment_days integer not null default 30 check (invoice_payment_days between 0 and 120),
  updated_at timestamptz not null default now()
);
insert into public.commerce_settings (id) values (1) on conflict do nothing;

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'particulier' check (type in ('particulier', 'professionnel')),
  name text not null check (char_length(name) between 1 and 200),
  email text not null default '',
  phone text not null default '',
  address text not null default '',
  postal_code text not null default '',
  city text not null default '',
  country text not null default 'France',
  siret text not null default '',
  vat_number text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index clients_name_idx on public.clients (lower(name));
create index clients_email_idx on public.clients (lower(email));

create table public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 200),
  description text not null default '',
  unit_price_cents integer not null default 0 check (unit_price_cents >= 0),
  unit text not null default 'forfait',
  vat_rate_bps integer not null default 2000 check (vat_rate_bps between 0 and 10000),
  category text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Numérotation continue, attribuée de façon atomique côté base.
create table public.document_counters (
  kind text not null check (kind in ('quote', 'invoice', 'deposit', 'credit')),
  year integer not null,
  last_number integer not null default 0,
  primary key (kind, year)
);

create function public.next_document_number(p_kind text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year integer := extract(year from (now() at time zone 'Europe/Paris'))::integer;
  v_number integer;
  v_prefix text;
begin
  insert into public.document_counters as c (kind, year, last_number)
  values (p_kind, v_year, 1)
  on conflict (kind, year) do update set last_number = c.last_number + 1
  returning last_number into v_number;

  v_prefix := case p_kind
    when 'quote' then 'D'
    when 'invoice' then 'F'
    when 'deposit' then 'A'
    else 'AV'
  end;
  return v_prefix || '-' || v_year || '-' || lpad(v_number::text, 4, '0');
end;
$$;

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  number text unique,
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'accepted', 'refused', 'expired')),
  client_id uuid references public.clients (id) on delete restrict,
  client_snapshot jsonb not null default '{}'::jsonb,
  issue_date date not null default current_date,
  valid_until date,
  service_period text not null default '',
  project_description text not null default '',
  special_conditions text not null default '',
  payment_terms text not null default '',
  cancellation_terms text not null default '',
  delivery_terms text not null default '',
  usage_terms text not null default '',
  deposit_enabled boolean not null default true,
  deposit_bps integer not null default 3000 check (deposit_bps between 0 and 10000),
  total_ht_cents integer not null default 0,
  total_vat_cents integer not null default 0,
  total_ttc_cents integer not null default 0,
  deposit_cents integer not null default 0,
  balance_cents integer not null default 0,
  vat_breakdown jsonb not null default '[]'::jsonb,
  pdf_path text,
  validated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index quotes_client_idx on public.quotes (client_id);

create table public.quote_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes (id) on delete cascade,
  position integer not null default 0,
  service_id uuid references public.services (id) on delete set null,
  title text not null check (char_length(title) between 1 and 300),
  description text not null default '',
  quantity numeric(12, 3) not null default 1 check (quantity > 0),
  unit text not null default 'forfait',
  unit_price_cents integer not null default 0 check (unit_price_cents >= 0),
  vat_rate_bps integer not null default 2000 check (vat_rate_bps between 0 and 10000),
  total_ht_cents integer not null default 0
);
create index quote_items_quote_idx on public.quote_items (quote_id);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  number text unique,
  kind text not null default 'invoice' check (kind in ('invoice', 'deposit')),
  status text not null default 'draft'
    check (status in ('draft', 'issued', 'partially_paid', 'paid', 'cancelled')),
  quote_id uuid references public.quotes (id) on delete restrict,
  client_id uuid references public.clients (id) on delete restrict,
  client_snapshot jsonb not null default '{}'::jsonb,
  issue_date date not null default current_date,
  due_date date,
  service_period text not null default '',
  notes text not null default '',
  payment_terms text not null default '',
  total_ht_cents integer not null default 0,
  total_vat_cents integer not null default 0,
  total_ttc_cents integer not null default 0,
  vat_breakdown jsonb not null default '[]'::jsonb,
  deposits_deducted_cents integer not null default 0,
  amount_due_cents integer not null default 0,
  paid_cents integer not null default 0,
  pdf_path text,
  issued_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index invoices_client_idx on public.invoices (client_id);
create index invoices_quote_idx on public.invoices (quote_id);

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  position integer not null default 0,
  title text not null check (char_length(title) between 1 and 300),
  description text not null default '',
  quantity numeric(12, 3) not null default 1 check (quantity > 0),
  unit text not null default 'forfait',
  unit_price_cents integer not null default 0,
  vat_rate_bps integer not null default 2000 check (vat_rate_bps between 0 and 10000),
  total_ht_cents integer not null default 0
);
create index invoice_items_invoice_idx on public.invoice_items (invoice_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete restrict,
  paid_on date not null default current_date,
  amount_cents integer not null check (amount_cents > 0),
  method text not null check (method in ('virement', 'carte', 'especes', 'cheque', 'autre')),
  reference text not null default '',
  comment text not null default '',
  created_at timestamptz not null default now()
);
create index payments_invoice_idx on public.payments (invoice_id);

alter table public.commerce_settings enable row level security;
alter table public.clients enable row level security;
alter table public.services enable row level security;
alter table public.document_counters enable row level security;
alter table public.quotes enable row level security;
alter table public.quote_items enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.payments enable row level security;

revoke all on
  public.commerce_settings, public.clients, public.services, public.document_counters,
  public.quotes, public.quote_items, public.invoices, public.invoice_items, public.payments
from anon, authenticated;
revoke all on function public.next_document_number(text) from public, anon, authenticated;

-- Archive privée des PDF définitifs.
insert into storage.buckets (id, name, public)
values ('commerce-documents', 'commerce-documents', false)
on conflict (id) do nothing;
