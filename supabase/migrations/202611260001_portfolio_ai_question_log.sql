-- Optional Hosted question log. Apply only to the Supabase project you control.
begin;

create table public.portfolio_ai_question_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  question text not null check (length(question) between 1 and 2000),
  page_path text check (length(page_path) between 1 and 2048 and left(page_path, 1) = '/'),
  answer_status text not null check (answer_status in ('answered', 'excerpt_fallback', 'insufficient', 'error'))
);

create index portfolio_ai_question_log_created_at_idx on public.portfolio_ai_question_log (created_at);
alter table public.portfolio_ai_question_log enable row level security;
revoke all on table public.portfolio_ai_question_log from public, anon, authenticated, service_role;
grant insert on table public.portfolio_ai_question_log to service_role;

commit;
