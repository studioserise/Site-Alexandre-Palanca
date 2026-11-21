-- Erreurs des tâches automatiques, avec le nom de la tâche concernée et si elle s'est rétablie depuis.
-- net._http_response ne garde pas l'adresse appelée : la tâche est retrouvée d'après l'heure
-- de lancement (cron.job_run_details), la réponse étant enregistrée dans la minute qui suit.

create or replace function public.task_of_response(p_created timestamptz)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select j.jobname
  from cron.job_run_details d
  join cron.job j on j.jobid = d.jobid
  where d.start_time between p_created - interval '65 seconds' and p_created
  order by d.start_time desc
  limit 1;
$$;

create or replace function public.recent_task_errors(p_since timestamptz)
returns table (
  id bigint, status_code integer, timed_out boolean, error_msg text, content text,
  created timestamptz, jobname text, recovered boolean
)
language sql
security definer
set search_path = ''
as $$
  with errors as (
    select r.id, r.status_code, coalesce(r.timed_out, false) as timed_out, r.error_msg,
      left(r.content, 300) as content, r.created, public.task_of_response(r.created) as jobname
    from net._http_response r
    where r.created >= p_since
      and (r.status_code >= 400 or r.error_msg is not null or r.timed_out)
  )
  select e.*, exists (
    select 1 from net._http_response ok
    where ok.id > e.id and ok.status_code between 200 and 299
      and public.task_of_response(ok.created) is not distinct from e.jobname
  ) as recovered
  from errors e
  order by e.id;
$$;

revoke all on function public.task_of_response(timestamptz) from public, anon, authenticated;
revoke all on function public.recent_task_errors(timestamptz) from public, anon, authenticated;
grant execute on function public.recent_task_errors(timestamptz) to service_role;
