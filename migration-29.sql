-- Migration 29 — parent meeting reminder automation.
--
-- Two things:
--   1. A tracking table so the reminder for a given meeting only ever
--      sends once, even if the scheduled function happens to run more
--      than once on the same day (a retry, a manual trigger, etc.).
--   2. Seeding default Site Content rows for the new structured meeting
--      dates and the editable reminder template, so the admin screen has
--      sensible starting values instead of blank fields.
--
-- Safe to re-run.

create table if not exists meeting_reminders_sent (
  meeting_key text primary key,
  sent_for_date date not null,
  sent_at timestamptz not null default now()
);

-- Dollar-quoting ($$...$$) avoids having to escape every apostrophe in
-- the template text below (Corrie's, we'd, etc.) — much safer than the
-- usual '' escaping for a block of prose this size.
insert into site_content (key, value) values
  ('meeting_aug28_date', ''),
  ('meeting_sep3_date', ''),
  ('parent_meeting_reminder_template', $$Hi {{parent_name}},

{{greeting}}! This is a reminder that {{student_name}}'s Shine parent meeting is tomorrow: {{meeting_details}}, at Granada Heights Friends Church.

We'd love to see you there — please reach out if you have any questions.

Grace and Peace,
Corrie Villa
Shine Dance Studio$$)
on conflict (key) do nothing;
