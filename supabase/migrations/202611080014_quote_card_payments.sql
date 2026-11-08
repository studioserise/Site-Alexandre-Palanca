-- Paiement par carte (Stripe) de l'acompte ou du solde depuis la page de paiement.
-- Solde payé par carte avant que la facture finale n'existe : gardé sur le devis,
-- puis reporté comme règlement sur la facture finale à son émission.
alter table public.quotes add column if not exists online_balance_paid_cents integer not null default 0;
alter table public.quotes add column if not exists online_payment_refs text not null default '';
