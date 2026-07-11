-- Shine update 3: three-state attendance (Present / Tardy / Absent)
-- matching the paper sign-in sheets. Run ONCE in the SQL Editor.
alter table attendance add column if not exists status text;

-- Student photos: PRIVATE bucket (children's photos, staff-only access)
alter table students add column if not exists photo_path text;
insert into storage.buckets (id, name, public) values ('student-photos', 'student-photos', false)
on conflict (id) do nothing;
create policy "staff read student photos" on storage.objects for select using (bucket_id = 'student-photos' and auth.role() = 'authenticated');
create policy "staff insert student photos" on storage.objects for insert with check (bucket_id = 'student-photos' and auth.role() = 'authenticated');
create policy "staff update student photos" on storage.objects for update using (bucket_id = 'student-photos' and auth.role() = 'authenticated');
create policy "staff delete student photos" on storage.objects for delete using (bucket_id = 'student-photos' and auth.role() = 'authenticated');
