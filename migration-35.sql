-- Migration 35 — attendance duplicates + alert email repair.
--
-- RUN THIS BEFORE DEPLOYING THE NEW shine-admin CODE. The new save uses an
-- "upsert" that depends on the unique rule created in step 2. Without it,
-- every attendance save will fail with an error about a missing constraint.
--
-- Safe to re-run.

-- ------------------------------------------------------------------
-- 1. Remove duplicate marks (same student + same class + same date).
-- Keeps the MOST RECENT one, which is the edit Corrie actually meant:
-- in her example, Absent was saved first and Tardy second, so Tardy stays.
-- ------------------------------------------------------------------
delete from attendance a
using attendance b
where a.enrollment_id = b.enrollment_id
  and a.class_date = b.class_date
  and (coalesce(a.created_at, 'epoch') < coalesce(b.created_at, 'epoch')
       or (coalesce(a.created_at, 'epoch') = coalesce(b.created_at, 'epoch') and a.id < b.id));

-- ------------------------------------------------------------------
-- 2. Make a second mark for the same student on the same date impossible.
-- ------------------------------------------------------------------
do $$ begin
  alter table attendance add constraint attendance_one_mark_per_day unique (enrollment_id, class_date);
exception when duplicate_object or duplicate_table then null; end $$;

-- ------------------------------------------------------------------
-- 3. Repair the alert tracking table if migration-32 never ran.
-- If it still has the OLD shape (keyed by student, no enrollment_id
-- column), every alert attempt fails before an email is ever sent. That
-- is the most likely reason no alert emails are arriving.
-- ------------------------------------------------------------------
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'attendance_alerts_sent' and column_name = 'enrollment_id'
  ) then
    drop table if exists attendance_alerts_sent;
    create table attendance_alerts_sent (
      id uuid primary key default gen_random_uuid(),
      enrollment_id uuid not null references enrollments(id) on delete cascade,
      alert_type text not null,
      period_start date not null,
      sent_at timestamptz not null default now(),
      unique (enrollment_id, alert_type, period_start)
    );
  end if;
end $$;

-- migration-32 created this table without any access rules. Signed-in
-- staff get full access; the public site gets none.
alter table attendance_alerts_sent enable row level security;
drop policy if exists "staff manage alert locks" on attendance_alerts_sent;
create policy "staff manage alert locks" on attendance_alerts_sent
  for all to authenticated using (true) with check (true);

-- ------------------------------------------------------------------
-- 4. DIAGNOSTIC. Send Devin a screenshot of this result.
-- Lists every student+class that has 2 or more tardies or absences in
-- the current alert period. If this comes back EMPTY, no alert was due
-- yet and the system is behaving correctly: since the per-class fix, it
-- takes 2 absences (or tardies) in the SAME class to trigger an email.
-- If it lists rows, those are alerts that should have gone out.
-- ------------------------------------------------------------------
with period as (
  select
    (select value::date from site_content where key = 'attendance_period_start') as p_start,
    (select value::date from site_content where key = 'attendance_period_end') as p_end
)
select
  s.first_name || ' ' || s.last_name as student,
  c.name as class,
  count(*) filter (where a.status = 'absent') as absences,
  count(*) filter (where a.status = 'tardy') as tardies,
  (select count(*) from attendance_alerts_sent x where x.enrollment_id = e.id) as alerts_recorded_sent,
  f.email as parent_email
from attendance a
join enrollments e on e.id = a.enrollment_id
join students s on s.id = e.student_id
join classes c on c.id = e.class_id
left join families f on f.id = s.family_id
cross join period
where a.class_date between period.p_start and period.p_end
group by s.first_name, s.last_name, c.name, e.id, f.email
having count(*) filter (where a.status = 'absent') >= 2
    or count(*) filter (where a.status = 'tardy') >= 2
order by student;
