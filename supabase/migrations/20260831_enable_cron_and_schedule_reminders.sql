-- Enables scheduled daily task reminders via the send-reminders edge function.
-- NOTE: this file documents the migration that was applied directly to the
-- project (via the Supabase MCP). The actual x-cron-secret value used in
-- production is NOT committed here (public repo) — replace the placeholder
-- below with the real CRON_SECRET value before re-running this elsewhere.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'lia-recordatorios-diarios',
  '0 12 * * *', -- 12:00 UTC ≈ 08:00 America/La_Paz
  $$
  select net.http_post(
    url := 'https://coeoasnibxuvpodoixbd.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer sb_publishable_zmTw7hmPAX6nybXvJ7YCVg_ccHuSV1q',
      'x-cron-secret', '<CRON_SECRET value from `supabase secrets list`>'
    ),
    body := '{}'::jsonb
  );
  $$
);
