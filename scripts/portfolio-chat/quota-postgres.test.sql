-- This fixture runs only in a fresh, disposable PostgreSQL service.
\set ON_ERROR_STOP on
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
\ir ../../supabase/migrations/202611100001_vincent_ai_analytics.sql

do $$
begin
  if not (select bool_and(relrowsecurity) from pg_class where oid in ('public.vincent_ai_events'::regclass, 'public.vincent_ai_quota'::regclass)) then
    raise exception 'Row-level security is not enabled';
  end if;
  if has_table_privilege('anon', 'public.vincent_ai_events', 'insert') or
     has_table_privilege('authenticated', 'public.vincent_ai_events', 'insert') or
     not has_table_privilege('service_role', 'public.vincent_ai_events', 'insert') or
     has_function_privilege('anon', 'public.vincent_ai_reserve_quota(integer,integer,numeric,numeric)', 'execute') or
     has_function_privilege('authenticated', 'public.vincent_ai_reserve_quota(integer,integer,numeric,numeric)', 'execute') or
     not has_function_privilege('service_role', 'public.vincent_ai_reserve_quota(integer,integer,numeric,numeric)', 'execute') then
    raise exception 'Unexpected table or function privileges';
  end if;
end $$;

begin;
set local role service_role;
insert into public.vincent_ai_events (session_id,event_type,page_path) values (gen_random_uuid(),'chat','/');
do $$ begin
  if not public.vincent_ai_reserve_quota(1,10,1,0.01) or public.vincent_ai_reserve_quota(1,10,1,0.01) then
    raise exception 'Per-minute limit failed';
  end if;
end $$;
rollback;

begin;
set local role service_role;
do $$ begin
  if not public.vincent_ai_reserve_quota(10,1,1,0.01) or public.vincent_ai_reserve_quota(10,1,1,0.01) then
    raise exception 'Per-day limit failed';
  end if;
end $$;
rollback;

begin;
set local role service_role;
do $$ begin
  if not public.vincent_ai_reserve_quota(10,10,0.015,0.01) or public.vincent_ai_reserve_quota(10,10,0.015,0.01) then
    raise exception 'Budget limit failed';
  end if;
end $$;
rollback;
