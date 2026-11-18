-- Migration 45 — gallery choices (which photos are highlights, which are hidden).
--
-- Safe to run on the live database at any time, and safe to re-run.
-- It only ADDS one small table. The live public site does not read it until
-- the new public code (highlights strip + Gallery page) is pushed.
--
-- One row per gallery photo, keyed by the photo's file name in the
-- "site-photos" bucket (gallery/<name>). A photo with NO row is treated as
-- "shown in the gallery, not a highlight", so nothing has to be filled in.

create table if not exists gallery_photos (
  name            text primary key check (char_length(name) between 1 and 300),
  show_in_gallery boolean not null default true,
  featured        boolean not null default false,
  sort_order      integer not null default 0,
  updated_at      timestamptz not null default now()
);

alter table gallery_photos enable row level security;

-- Anyone may read the choices (the public site needs them).
drop policy if exists "public read gallery choices" on gallery_photos;
create policy "public read gallery choices" on gallery_photos for select using (true);

-- Any signed-in staff member may change them. This matches who may already
-- upload and remove the photos themselves.
drop policy if exists "staff manage gallery choices" on gallery_photos;
create policy "staff manage gallery choices" on gallery_photos for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

grant select on gallery_photos to anon;
grant select, insert, update, delete on gallery_photos to authenticated;

-- Check: should return one row saying 0 (or more, if re-run after use).
select count(*) as gallery_choice_rows from gallery_photos;
