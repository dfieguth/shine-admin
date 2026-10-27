-- Migration 36 — "Hide waitlisted students" privacy setting.
--
-- RUN THIS BEFORE DEPLOYING THE NEW shine-admin CODE. The Privacy Settings
-- screen saves the whole settings row at once, so if the code goes live
-- before this column exists, saving ANY privacy setting will fail with an
-- "unknown column" error until the migration is run.
--
-- Defaults to false (waitlist still printed), so nothing changes on the
-- printed rosters until someone turns it on.
--
-- Safe to re-run.

alter table privacy_settings add column if not exists hide_waitlist boolean not null default false;

-- Verify. Should return one row showing hide_waitlist = false.
select id, hide_student_ages, hide_waitlist from privacy_settings;
