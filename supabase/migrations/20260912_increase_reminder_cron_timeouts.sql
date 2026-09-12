-- Increases the pg_net timeout for both reminder cron jobs from the
-- default 5000ms, since send-time-reminders was observed taking 5-13s
-- on a cold start (the npm:web-push import is slow to initialize),
-- causing pg_net to report a false timeout/failure even though the
-- function kept running and completed successfully server-side.
--
-- NOTE: secret value redacted (public repo) — replace the placeholder
-- below with the real CRON_SECRET from `supabase secrets list` before
-- re-running.

select cron.alter_job(
  job_id := 1,
  command := $$
  select net.http_post(
    url := 'https://coeoasnibxuvpodoixbd.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer sb_publishable_zmTw7hmPAX6nybXvJ7YCVg_ccHuSV1q',
      'x-cron-secret', '<CRON_SECRET value from `supabase secrets list`>'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 15000
  );
  $$
);

select cron.alter_job(
  job_id := 2,
  command := $$
  select net.http_post(
    url := 'https://coeoasnibxuvpodoixbd.supabase.co/functions/v1/send-time-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer sb_publishable_zmTw7hmPAX6nybXvJ7YCVg_ccHuSV1q',
      'x-cron-secret', '<CRON_SECRET value from `supabase secrets list`>'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 15000
  );
  $$
);
