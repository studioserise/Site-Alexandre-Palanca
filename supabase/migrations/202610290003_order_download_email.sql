alter table public.gallery_orders
  add column if not exists download_email_sent_at timestamptz;
