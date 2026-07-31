-- Migration 19 — a small, curated "Site Content" table so Corrie can edit
-- specific pieces of public-facing copy herself, without a code push.
-- Deliberately NOT a rich open editor — just plain text fields for a fixed,
-- known set of keys the code already knows how to render. Safe to re-run.

create table if not exists site_content (
  key text primary key,
  value text not null default '',
  updated_at timestamptz not null default now()
);

alter table site_content enable row level security;

-- Public (anonymous) visitors can read this — it's what renders the public
-- site and the registration form. They can never write to it.
drop policy if exists "public read site_content" on site_content;
create policy "public read site_content" on site_content
  for select using (true);

-- Only signed-in staff can write.
drop policy if exists "staff write site_content" on site_content;
create policy "staff write site_content" on site_content
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Seed with the exact current copy, so nothing on the live site changes
-- until Corrie deliberately edits something. on conflict do nothing means
-- this is safe to re-run without clobbering anything she's already changed.
insert into site_content (key, value) values
  ('hero_headline', 'Shining the Light of Jesus.'),
  ('hero_subtext', 'Free classes for our community. Shining God''s love to students and families.'),
  ('hero_verse', '"Let your light shine before others, that they may see your good deeds and glorify your Father in heaven." — Matthew 5:16'),
  ('donation_badge', 'Shine runs on volunteers and donations. Classes are free, but a $100 donation is suggested per family at registration for those who are able.'),
  ('mission_headline', 'Free dance classes for our community, connecting students with Christ.'),
  ('mission_body', 'Shine Dance Studio is a ministry of Granada Heights Friends Church. We''re excited to offer free dance classes to children and youth in our community, at a variety of levels from beginning to advanced, starting at age 5. No dance experience is needed to jump in!'),
  ('mission_chip_level', 'Beginning to advanced'),
  ('registration_intro', 'Fill this out to sign up or to be added to a waiting list, and Corrie will reach out with your dancer''s class details. It takes about five minutes.'),
  ('meeting_aug28_label', 'Friday, August 28th, 6:00–7:00pm (Lindley Hall)'),
  ('meeting_sep3_label', 'Wednesday, September 2nd, 7:00–8:00pm (Joy Hall)'),
  ('not_sure_label', 'I''m not sure — please contact me to help pick the right class.'),
  ('class_select_label', 'Please select your class(es) for enrollment.')
on conflict (key) do nothing;
