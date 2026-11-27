-- Optional daily Cron job command. Adjust the interval to your retention period.
delete from public.portfolio_ai_question_log
where created_at < now() - interval '14 days';
