-- Shine update 16: instant registration processing (no admin approval gate)
-- Run ONCE in the Supabase SQL Editor.

-- ============================================================
-- Public (anon) can INSERT into families, students, and enrollments —
-- insert-only, matching the same pattern already used for `registrations`,
-- `volunteer_inquiries`, and `contact_interest`. This does NOT grant the
-- public any ability to READ these tables — a visitor still cannot browse
-- the roster, see other families' info, or see who's enrolled where.
-- Capacity checks still go through the existing security-definer
-- class_enrollment_counts() function, not direct table access.
-- ============================================================
do $$ begin
  create policy "public can insert families" on families for insert with check (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "public can insert students" on students for insert with check (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "public can insert enrollments" on enrollments for insert with check (true);
exception when duplicate_object then null; end $$;

-- Track WHEN a student was dropped from a class, not just that they
-- currently are — groundwork for a future "enrollment history" view.
alter table enrollments add column if not exists dropped_at timestamptz;
