-- Migration 37 — recital ticket settings Corrie can change herself.
--
-- RUN THIS IN SUPABASE BEFORE PUSHING THE NEW shine-admin CODE. The
-- Settings & Release screen saves these columns, so saving will fail with
-- an "unknown column" error until this has been run. (The public site is
-- safe either way: it falls back to the old behavior if these are missing.)
--
-- What it adds to recital_settings:
--   page_enabled      whether the public /tickets page and its footer link
--                     are shown. Defaults to FALSE: the page stays hidden
--                     until Corrie switches it on.
--   max_per_family    the ticket limit per family (was hard-coded to 6).
--   family_cap_scope  whether that limit is 'per_show' or 'total' across
--                     all shows. Null means "follow the capacity mode",
--                     which is exactly how it behaved before.
--   page_notes        free text shown on the tickets page (parking, lap
--                     children, arrival time, and so on).
--   emails_enabled    master switch for recital emails. Defaults to FALSE
--                     so nothing can be sent while testing.
--   confirm_* / reminder_*   editable email wording.
--
-- It also loosens the database's own hard limit of 6 tickets per
-- reservation to 50, so raising max_per_family above 6 actually works.
--
-- Safe to re-run.

alter table recital_settings add column if not exists page_enabled boolean not null default false;
alter table recital_settings add column if not exists max_per_family integer not null default 6;
alter table recital_settings add column if not exists family_cap_scope text;
alter table recital_settings add column if not exists page_notes text;
alter table recital_settings add column if not exists emails_enabled boolean not null default false;
alter table recital_settings add column if not exists confirm_subject text;
alter table recital_settings add column if not exists confirm_body text;
alter table recital_settings add column if not exists reminder_subject text;
alter table recital_settings add column if not exists reminder_body text;

-- Replace the "1 to 6" rule on ticket_reservations.ticket_count with
-- "1 to 50", whatever the old rule happens to be named.
do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.ticket_reservations'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%ticket_count%'
  loop
    execute format('alter table public.ticket_reservations drop constraint %I', r.conname);
  end loop;
end $$;
alter table ticket_reservations add constraint ticket_reservations_ticket_count_check check (ticket_count > 0 and ticket_count <= 50);

-- Verify. Should return one row: page_enabled = false, max_per_family = 6,
-- emails_enabled = false.
select id, page_enabled, max_per_family, family_cap_scope, emails_enabled from recital_settings;
