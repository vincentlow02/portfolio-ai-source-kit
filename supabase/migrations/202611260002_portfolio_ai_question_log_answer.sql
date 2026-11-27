-- Keep earlier question records and allow old deployments to keep inserting them.
alter table public.portfolio_ai_question_log add column if not exists answer text;
notify pgrst, 'reload schema';
