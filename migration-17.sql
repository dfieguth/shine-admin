-- Shine update 19: a real, admin-editable Policies & Forms page.
-- Run ONCE in the Supabase SQL Editor.

create table if not exists policy_sections (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  sort_order integer default 0,
  active boolean default true,
  created_at timestamptz default now()
);
alter table policy_sections enable row level security;
do $$ begin
  create policy "staff full access policy sections" on policy_sections for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "public can view active policy sections" on policy_sections for select using (active = true);
exception when duplicate_object then null; end $$;

-- Seed with the real content Corrie provided, so the page has content
-- immediately without needing to be retyped through the admin.
-- Guarded so re-running this migration never creates duplicate rows.
insert into policy_sections (title, body, sort_order)
select * from (values
('Mandatory Parent Meetings', 'Choose one to attend:
• Friday, August 28th, 6:00–7:00pm (Lindley Hall)
• Wednesday, September 2nd, 7:00–8:00pm (Joy Hall)

Students are not fully enrolled until one parent/guardian (not a sibling) attends one of these meetings.', 1),
('Shine Recital — February 20th', 'Students are highly encouraged to participate in the Shine Recital. Participation in class assumes participation in the annual recital. If you have a schedule conflict with the mandatory Dress Rehearsal or Recital, please email Corrie at shineGHFC@gmail.com.

A $90 costume fee will be due October 1st, but please let us know on your Shine Commitment Form if you are in need of a scholarship. We can provide a limited number of scholarships, so please only request if it is truly a need.', 2),
('Attendance', 'Attendance and promptness at class is mandatory! Although we are a ministry, we are teaching our students a challenging skill that requires consistent individual practice and teamwork. Please do not register your child for a class that poses schedule conflicts for your family. Students may be dropped from a class on account of poor attendance, arriving late, or leaving early. Your child''s class is only 1 hour a week, so please plan accordingly, and do not miss class for reasons other than sickness or emergencies.', 3)
) as seed(title, body, sort_order)
where not exists (select 1 from policy_sections);
