-- Migration 31 — recital ticket reservation system.
--
-- Three tables:
--   recital_shows        one row per performance (name, date, time, and a
--                         per-show capacity used only in "per_show" mode)
--   recital_settings      a single-row config: which capacity mode is
--                         active (per_show vs combined), the combined
--                         capacity number (used only in that mode), the
--                         automatic release deadline, and whether release
--                         has actually happened (set either automatically
--                         once the deadline passes, or manually by an
--                         admin — both paths converge on the same flag)
--   ticket_reservations   one row per family's request for one show.
--                         Identified by email, not matched against
--                         existing family records — consistent with how
--                         registration itself deliberately never
--                         auto-matches. A request that doesn't fit
--                         remaining capacity becomes 'waitlist' instead
--                         of being rejected, same pattern already proven
--                         out for class capacity.
--
-- Safe to re-run.

create table if not exists recital_shows (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  show_date date,
  show_time text,
  capacity integer, -- only meaningful in per_show capacity mode
  active boolean not null default true,
  sort_order integer default 0,
  created_at timestamptz default now()
);

create table if not exists recital_settings (
  id integer primary key default 1,
  capacity_mode text not null default 'per_show', -- 'per_show' | 'combined'
  combined_capacity integer, -- only meaningful in combined capacity mode
  reservation_deadline timestamptz, -- when automatic release happens, if set
  released boolean not null default false, -- true once release has happened, by either path
  released_at timestamptz,
  constraint recital_settings_single_row check (id = 1)
);
insert into recital_settings (id) values (1) on conflict (id) do nothing;

create table if not exists ticket_reservations (
  id uuid primary key default gen_random_uuid(),
  show_id uuid references recital_shows(id) on delete cascade,
  parent_name text not null,
  email text not null,
  phone text,
  student_name text,
  ticket_count integer not null check (ticket_count > 0 and ticket_count <= 6),
  status text not null default 'confirmed', -- 'confirmed' | 'waitlist'
  phase text not null default 'initial', -- 'initial' | 'release' — which window this happened in, for reporting only
  created_at timestamptz default now()
);

alter table recital_shows enable row level security;
alter table recital_settings enable row level security;
alter table ticket_reservations enable row level security;

-- Public can read active shows (name/date/time/capacity — nothing
-- sensitive here) and the single settings row (mode/deadline/released —
-- also nothing sensitive), same reasoning already used for the public
-- classes list.
drop policy if exists "public read active shows" on recital_shows;
create policy "public read active shows" on recital_shows for select using (active = true);
drop policy if exists "public read settings" on recital_settings;
create policy "public read settings" on recital_settings for select using (true);

-- Public can INSERT a reservation, same insert-only pattern used
-- throughout this project — never SELECT on this table directly, since
-- it holds real parent contact info. Any count/eligibility check goes
-- through the security-definer RPCs below instead.
drop policy if exists "public insert reservations" on ticket_reservations;
create policy "public insert reservations" on ticket_reservations for insert with check (true);

-- Staff (authenticated) can do everything on all three — matches how
-- every other admin-managed table already works in this project.
drop policy if exists "staff manage shows" on recital_shows;
create policy "staff manage shows" on recital_shows for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists "staff manage settings" on recital_settings;
create policy "staff manage settings" on recital_settings for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists "staff manage reservations" on ticket_reservations;
create policy "staff manage reservations" on ticket_reservations for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Confirmed ticket counts per show — used for per-show capacity checks
-- and for the public "X seats left" display, without ever exposing the
-- underlying reservation rows themselves.
create or replace function ticket_counts_by_show()
returns table(show_id uuid, confirmed_count bigint)
language sql security definer as $$
  select show_id, coalesce(sum(ticket_count), 0) as confirmed_count
  from ticket_reservations
  where status = 'confirmed'
  group by show_id;
$$;

-- Confirmed ticket count across every show combined — used only in
-- "combined" capacity mode.
create or replace function ticket_count_combined()
returns bigint
language sql security definer as $$
  select coalesce(sum(ticket_count), 0) from ticket_reservations where status = 'confirmed';
$$;

-- How many CONFIRMED tickets a specific email already has — this is what
-- enforces the 6-per-family cap across multiple separate submissions,
-- without ever letting the public browse anyone else's reservations. Pass
-- a show_id to check just that show (per_show mode); pass null to check
-- across every show combined (combined mode).
create or replace function ticket_count_for_email(check_email text, check_show_id uuid default null)
returns integer
language sql security definer as $$
  select coalesce(sum(ticket_count), 0)::integer
  from ticket_reservations
  where lower(email) = lower(check_email)
    and status = 'confirmed'
    and (check_show_id is null or show_id = check_show_id);
$$;

-- Soft eligibility check for the initial (performers-only) reservation
-- window: does any enrolled, "in recital" student have this name? Case-
-- insensitive partial match, not exact — matches this project's existing
-- tolerance for imperfect name matching elsewhere (registration doesn't
-- auto-match returning students either). This is a helpful check, not a
-- hard security boundary; it only ever returns a boolean, never any
-- actual student data.
create or replace function is_recital_family(check_name text)
returns boolean
language sql security definer as $$
  select exists (
    select 1
    from students st
    join enrollments e on e.student_id = st.id and e.status = 'enrolled'
    join classes c on c.id = e.class_id and c.in_recital = true
    where lower(st.first_name || ' ' || st.last_name) like '%' || lower(trim(check_name)) || '%'
       or lower(check_name) like '%' || lower(st.first_name) || '%'
  );
$$;
