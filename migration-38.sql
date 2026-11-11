-- Migration 38 — "Coming soon" mode for the recital tickets page.
--
-- RUN THIS (AFTER migration-37) IN SUPABASE BEFORE PUSHING THE NEW
-- shine-admin CODE. Saving on the Recital Tickets settings screen will
-- fail with an "unknown column" error until both have been run.
--
-- What it adds to recital_settings:
--   page_mode               'hidden' | 'coming_soon' | 'open'. Replaces the
--                           simple on/off switch from migration 37 (that
--                           column stays and is kept in step, so nothing
--                           breaks if only one site has been updated).
--   coming_soon_message     text shown on the page while in coming-soon mode.
--   coming_soon_photo_url   optional photo (for example, from last year's
--                           show) shown on the coming-soon page.
--   coming_soon_show_dates  whether the coming-soon page lists the show
--                           dates and times.
--   opens_at                optional date and time reservations go live.
--                           The page shows it, and switches itself from
--                           coming soon to open when that moment arrives.
--
-- The photo itself is stored in the existing public "site-photos" bucket,
-- so no storage changes are needed.
--
-- Safe to re-run.

alter table recital_settings add column if not exists page_mode text;
alter table recital_settings add column if not exists coming_soon_message text;
alter table recital_settings add column if not exists coming_soon_photo_url text;
alter table recital_settings add column if not exists coming_soon_show_dates boolean not null default true;
alter table recital_settings add column if not exists opens_at timestamptz;

-- Start from whatever the on/off switch said: on = open, off = hidden.
update recital_settings
set page_mode = case when page_enabled then 'open' else 'hidden' end
where page_mode is null;

-- Verify. Should return one row with page_mode = 'hidden' (unless the
-- page had already been switched on, in which case 'open').
select id, page_enabled, page_mode, opens_at, coming_soon_show_dates from recital_settings;
