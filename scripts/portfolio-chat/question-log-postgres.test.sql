-- Run after quota-postgres.test.sql in the same disposable PostgreSQL service.
\set ON_ERROR_STOP on

-- Simulate a project that grants access by default when creating public tables.
alter default privileges in schema public grant all on tables to public, anon, authenticated, service_role;
\ir ../../supabase/migrations/202611260001_portfolio_ai_question_log.sql
alter default privileges in schema public revoke all on tables from public, anon, authenticated, service_role;

do $$
begin
  if not (select relrowsecurity from pg_class where oid = 'public.portfolio_ai_question_log'::regclass) then
    raise exception 'Question log must have row-level security enabled';
  end if;
  if has_table_privilege('anon', 'public.portfolio_ai_question_log', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER') or
     has_table_privilege('authenticated', 'public.portfolio_ai_question_log', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER') or
     not has_table_privilege('service_role', 'public.portfolio_ai_question_log', 'INSERT') or
     has_table_privilege('service_role', 'public.portfolio_ai_question_log', 'SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER') then
    raise exception 'Only the service role should have application access, with insert privileges';
  end if;
end $$;

begin;
insert into public.portfolio_ai_question_log (created_at, question, answer_status)
values (now() - interval '15 days', 'Expired fixture question', 'insufficient');
\ir ../../supabase/migrations/202611260002_portfolio_ai_question_log_answer.sql

set local role service_role;
insert into public.portfolio_ai_question_log (question, answer, answer_status)
values ('Recent fixture question', 'The answer returned by the widget.', 'answered');

do $$
declare
  invalid record;
begin
  for invalid in
    select * from (values
      ('', '/', 'answered'),
      (repeat('x', 2001), '/', 'answered'),
      ('Valid question', 'missing-leading-slash', 'answered'),
      ('Valid question', '/' || repeat('x', 2048), 'answered'),
      ('Valid question', '/', 'unknown')
    ) as rows(question, page_path, answer_status)
  loop
    begin
      insert into public.portfolio_ai_question_log (question, page_path, answer_status)
      values (invalid.question, invalid.page_path, invalid.answer_status);
    exception when check_violation then
      continue;
    end;
    raise exception 'Question log accepted an invalid row';
  end loop;
end $$;

reset role;
do $$
begin
  if not exists (
    select 1 from public.portfolio_ai_question_log
    where question = 'Recent fixture question' and answer = 'The answer returned by the widget.'
      and id is not null and created_at = now() and page_path is null
  ) then
    raise exception 'Question log insert did not apply the expected defaults';
  end if;
  if not exists (
    select 1 from public.portfolio_ai_question_log
    where question = 'Expired fixture question' and answer is null and answer_status = 'insufficient'
  ) then
    raise exception 'The answer migration changed a historical row';
  end if;
end $$;

\ir ../../supabase/question-log-retention.sql

do $$
begin
  if (select count(*) from public.portfolio_ai_question_log) <> 1 or
     not exists (select 1 from public.portfolio_ai_question_log where question = 'Recent fixture question') then
    raise exception 'Question log retention must remove only expired rows';
  end if;
end $$;
rollback;
