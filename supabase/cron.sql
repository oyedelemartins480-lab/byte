-- Byte · desktop notification schedule (run AFTER you deploy).
-- Calls Byte every minute so lock-in reminders, check-ins and "time's up"
-- notifications go out even when nobody has Byte open.
--
-- 1. Database → Extensions: turn on "pg_cron" and "pg_net".
-- 2. Replace YOUR-SITE (e.g. byte-xyz.vercel.app) and YOUR-CRON-SECRET (the
--    same value as CRON_SECRET in Vercel) below, then run this in the SQL Editor.

select cron.unschedule('byte-push-tick')
where exists (select 1 from cron.job where jobname = 'byte-push-tick');

select cron.schedule(
  'byte-push-tick',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://YOUR-SITE/api/push/tick',
    headers := jsonb_build_object(
      'Authorization', 'Bearer YOUR-CRON-SECRET',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  $$
);

-- Check it's running (a row per minute; status_code should be 200):
-- select status_code, content, created from net._http_response order by created desc limit 5;
