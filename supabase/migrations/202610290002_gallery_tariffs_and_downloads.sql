alter table public.galleries
  add column if not exists tariff text not null default 'tarif5'
  check (tariff in ('tarif0', 'tarif2', 'tarif5'));
