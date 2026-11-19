-- Apply only to the intended Supabase project. All access is server-only.
begin;

create table public.vincent_ai_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  event_type text not null check (event_type in ('chat', 'recommendation_click')),
  page_path text not null check (page_path ~ '^/([a-z0-9-]+/?)*$' and length(page_path) <= 160),
  project_id text check (project_id is null or project_id ~ '^[a-z0-9-]{1,80}$'),
  question_category text check (question_category is null or question_category in ('about', 'project', 'comparison', 'other')),
  answer_status text check (answer_status is null or answer_status in ('answered', 'insufficient', 'clarification', 'error')),
  model text check (model is null or (length(model) <= 80 and model ~ '^[a-zA-Z0-9._/-]+$')),
  input_tokens integer check (input_tokens is null or input_tokens between 0 and 1000000),
  output_tokens integer check (output_tokens is null or output_tokens between 0 and 1000000),
  latency_ms integer check (latency_ms is null or latency_ms between 0 and 120000),
  created_at timestamptz not null default now()
);
create index vincent_ai_events_created_at_idx on public.vincent_ai_events (created_at);
alter table public.vincent_ai_events enable row level security;
revoke all on table public.vincent_ai_events from public, anon, authenticated;
grant insert on table public.vincent_ai_events to service_role;

-- Counters are independent of analytics so a failed analytics insert cannot
-- disable quota enforcement. The transaction lock makes reservations atomic.
create table public.vincent_ai_quota (
  quota_day date primary key,
  minute_start timestamptz not null,
  minute_requests integer not null default 0,
  day_requests integer not null default 0,
  reserved_usd numeric(14, 6) not null default 0
);
alter table public.vincent_ai_quota enable row level security;
revoke all on table public.vincent_ai_quota from public, anon, authenticated;

create function public.vincent_ai_reserve_quota(
  p_minute_limit integer, p_daily_limit integer,
  p_daily_budget_usd numeric, p_request_reservation_usd numeric
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_day date := (now() at time zone 'UTC')::date;
  v_minute timestamptz := date_trunc('minute', now());
  v_quota public.vincent_ai_quota%rowtype;
begin
  if p_minute_limit is null or p_minute_limit < 1 or p_minute_limit > 10000
    or p_daily_limit is null or p_daily_limit < 1 or p_daily_limit > 1000000
    or p_daily_budget_usd is null or p_daily_budget_usd <= 0
    or p_request_reservation_usd is null or p_request_reservation_usd <= 0
    or p_request_reservation_usd > p_daily_budget_usd then
    raise exception 'Invalid quota configuration';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('vincent_ai_quota'));
  insert into public.vincent_ai_quota (quota_day, minute_start) values (v_day, v_minute)
    on conflict (quota_day) do nothing;
  select * into v_quota from public.vincent_ai_quota where quota_day = v_day for update;
  if v_quota.day_requests >= p_daily_limit
    or v_quota.reserved_usd + p_request_reservation_usd > p_daily_budget_usd
    or (v_quota.minute_start = v_minute and v_quota.minute_requests >= p_minute_limit) then
    return false;
  end if;
  update public.vincent_ai_quota set
    minute_start = v_minute,
    minute_requests = case when v_quota.minute_start = v_minute then v_quota.minute_requests + 1 else 1 end,
    day_requests = v_quota.day_requests + 1,
    reserved_usd = v_quota.reserved_usd + p_request_reservation_usd
    where quota_day = v_day;
  return true;
end;
$$;
revoke all on function public.vincent_ai_reserve_quota(integer, integer, numeric, numeric) from public, anon, authenticated;
grant execute on function public.vincent_ai_reserve_quota(integer, integer, numeric, numeric) to service_role;

commit;
