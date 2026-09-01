-- Schedules the every-5-minutes check for tasks with an exact reminder time.
-- NOTE: secret value redacted (public repo) — replace the placeholder below
-- with the real CRON_SECRET from `supabase secrets list` before re-running.

select cron.schedule(
  'lia-recordatorios-de-hora',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://coeoasnibxuvpodoixbd.supabase.co/functions/v1/send-time-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer sb_publishable_zmTw7hmPAX6nybXvJ7YCVg_ccHuSV1q',
      'x-cron-secret', '<CRON_SECRET value from `supabase secrets list`>'
    ),
    body := '{}'::jsonb
  );
  $$
);
