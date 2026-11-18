-- Migration 46 — editable wording for the recital tickets page, and an
-- optional recital banner on the main page.
--
-- Safe to run on the live database at any time, and safe to re-run.
-- It only ADDS columns. Every new column starts empty (or off), and empty
-- means "use the wording the site uses today", so nothing on the public
-- site changes until Corrie fills something in.

alter table recital_settings add column if not exists page_title text;          -- big heading while reservations are open
alter table recital_settings add column if not exists page_intro text;          -- the yellow "who can reserve" line above the form
alter table recital_settings add column if not exists ticket_note text;         -- line under the ticket after reserving
alter table recital_settings add column if not exists closed_message text;      -- shown while the page is hidden or closed
alter table recital_settings add column if not exists home_banner_enabled boolean not null default false;
alter table recital_settings add column if not exists home_banner_text text;    -- the main page banner wording

-- Check: should return one row with home_banner_enabled = false.
select page_title, home_banner_enabled from recital_settings where id = 1;
