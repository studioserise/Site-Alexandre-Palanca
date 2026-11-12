-- Défense en profondeur : ces tables sont déjà protégées par la sécurité au niveau des lignes
-- (RLS activée, aucune règle d'accès), mais les rôles publics y gardaient des droits SQL.
-- Elles ne sont lues et écrites que par les fonctions serveur (clé de service) : on retire
-- tout droit aux rôles « anon » et « authenticated », comme pour les autres tables.
revoke all on table
  public.contact_requests,
  public.notification_dismissals,
  public.planning_events,
  public.quote_reminders,
  public.web_feedback
from anon, authenticated;
