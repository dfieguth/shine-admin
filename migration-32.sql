-- Migration 32 — attendance alerts were counting a student's tardies and
-- absences COMBINED across every class they're enrolled in, instead of
-- separately per class. A student absent once each in three different
-- classes was incorrectly getting a "3rd absence" alert, when really she
-- hadn't hit even a 1st-absence threshold in any single class.
--
-- The alert-tracking table was keyed by student_id, which only allowed
-- ONE lock per student per alert type per period — meaning even after
-- fixing the counting logic in code, the OLD table shape couldn't
-- correctly track "2nd absence in Class A" as a separate thing from "2nd
-- absence in Class B" for the same student. Recreating it keyed by
-- enrollment_id instead (which already uniquely identifies one specific
-- student+class pairing) fixes that.
--
-- Dropping and recreating rather than altering: the OLD locks were based
-- on the incorrect combined counting, so they don't correctly describe
-- anything under the new per-class logic anyway — starting clean is the
-- correct behavior here, not just the convenient one. Worth knowing: this
-- does mean "Check all students against this period" may send some
-- alerts it wouldn't have sent before, if a student's real per-class
-- count (now counted correctly) actually crosses a threshold — that's
-- the fix working as intended, not a bug.
--
-- Safe to re-run.

drop table if exists attendance_alerts_sent;

create table attendance_alerts_sent (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references enrollments(id) on delete cascade,
  alert_type text not null,
  period_start date not null,
  sent_at timestamptz not null default now(),
  unique (enrollment_id, alert_type, period_start)
);
