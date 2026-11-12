-- Migration 42 — access codes per show, and the automatic recital reminder.
--
-- RUN THIS IN SUPABASE BEFORE PUSHING THE NEW CODE (both sites).
-- The public tickets page keeps working in between: the old page simply
-- sends no code, which is fine for any show that has none set.
--
-- 1. ACCESS CODES. Corrie wants each show to have its own code. Families
--    performing in the 2:00 show get that show's code, the 6:00 families
--    get theirs, and families in both get both, so nobody can reserve
--    seats for a show their child is not in.
--      recital_show_codes     one code per show. ADMIN-ONLY: the public
--                             can never read this table, so a code cannot
--                             be looked up from the website.
--      recital_shows.requires_code   a plain yes/no the public page CAN
--                             read, so it knows to ask for a code. Kept in
--                             step with the codes table automatically.
--      reserve_tickets()      now takes the code and checks it in the
--                             database. A show with a code needs the code;
--                             a show without one uses the dancer-name check
--                             exactly as before. After tickets are released
--                             to everyone, no code is needed.
--
-- 2. AUTOMATIC REMINDER. A reminder email to confirmed ticket holders a
--    set number of days before each show.
--      recital_settings.auto_reminder_enabled   off until Corrie turns it on
--      recital_settings.auto_reminder_days      how many days before (2)
--      recital_shows.reminder_sent_at           when that show's reminder
--                             went out, so it can never send twice.
--
-- Safe to re-run.

-- 1 -------------------------------------------------------------------
create table if not exists recital_show_codes (
  show_id uuid primary key references recital_shows(id) on delete cascade,
  code text not null,
  updated_at timestamptz not null default now()
);
alter table recital_show_codes enable row level security;
drop policy if exists "admins manage show codes" on recital_show_codes;
create policy "admins manage show codes" on recital_show_codes for all
  using (auth.role() = 'authenticated' and not is_teacher_role())
  with check (auth.role() = 'authenticated' and not is_teacher_role());

alter table recital_shows add column if not exists requires_code boolean not null default false;
alter table recital_shows add column if not exists reminder_sent_at timestamptz;

-- Keeps recital_shows.requires_code true exactly when that show has a
-- non-blank code, whatever changes in the codes table.
create or replace function sync_show_requires_code()
returns trigger
language plpgsql security definer set search_path = public as $$
declare v_show uuid := coalesce(new.show_id, old.show_id);
begin
  update recital_shows
  set requires_code = exists (select 1 from recital_show_codes c where c.show_id = v_show and length(trim(c.code)) > 0)
  where id = v_show;
  if tg_op = 'UPDATE' and old.show_id is distinct from new.show_id then
    update recital_shows
    set requires_code = exists (select 1 from recital_show_codes c where c.show_id = old.show_id and length(trim(c.code)) > 0)
    where id = old.show_id;
  end if;
  return null;
end $$;
drop trigger if exists trg_sync_show_requires_code on recital_show_codes;
create trigger trg_sync_show_requires_code
  after insert or update or delete on recital_show_codes
  for each row execute function sync_show_requires_code();

-- The reservation function gains one optional input (the code). The old
-- six-input version is removed so there is only ever one.
drop function if exists reserve_tickets(uuid, text, text, text, text, integer);

create or replace function reserve_tickets(
  p_show_id uuid, p_parent_name text, p_email text, p_phone text, p_student_name text, p_count integer, p_code text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s recital_settings%rowtype;
  sh recital_shows%rowtype;
  v_mode text; v_released boolean; v_scope text; v_max integer;
  v_have integer; v_left integer; v_confirmed integer; v_wait integer;
  v_parent text := left(trim(coalesce(p_parent_name, '')), 80);
  v_email text := lower(left(trim(coalesce(p_email, '')), 200));
  v_phone text := left(trim(coalesce(p_phone, '')), 40);
  v_student text := left(trim(coalesce(p_student_name, '')), 80);
  v_phase text; v_ids uuid[] := '{}'; v_id uuid; v_code text;
begin
  select * into s from recital_settings where id = 1;
  if not found then return jsonb_build_object('ok', false, 'code', 'closed'); end if;

  -- Is the page open? Coming soon opens by itself at the go-live time.
  v_mode := coalesce(s.page_mode, case when s.page_enabled then 'open' else 'hidden' end);
  if v_mode = 'coming_soon' and s.opens_at is not null and s.opens_at <= now() then v_mode := 'open'; end if;
  if v_mode <> 'open' then return jsonb_build_object('ok', false, 'code', 'closed'); end if;

  v_max := greatest(1, least(50, coalesce(s.max_per_family, 6)));
  if v_parent = '' or v_student = '' or v_phone = '' or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
     or p_count is null or p_count < 1 or p_count > v_max then
    return jsonb_build_object('ok', false, 'code', 'bad_input', 'max', v_max);
  end if;

  select * into sh from recital_shows where id = p_show_id and active = true;
  if not found then return jsonb_build_object('ok', false, 'code', 'no_show'); end if;

  -- Who may reserve right now. Once tickets are released to everyone,
  -- anybody can. Before that:
  --   - a show WITH an access code needs that code (Corrie hands each
  --     show's code to the families performing in it), and
  --   - a show with NO code falls back to the dancer-name check.
  -- A wrong code waits a moment before answering, which makes guessing
  -- codes by trial and error slow. This happens BEFORE the one-at-a-time
  -- lock below, so a guesser cannot hold up real families.
  v_released := coalesce(s.released, false) or (s.reservation_deadline is not null and s.reservation_deadline <= now());
  if not v_released then
    select code into v_code from recital_show_codes where show_id = p_show_id;
    if v_code is not null and length(trim(v_code)) > 0 then
      if lower(trim(coalesce(p_code, ''))) <> lower(trim(v_code)) then
        perform pg_sleep(0.4);
        return jsonb_build_object('ok', false, 'code', 'bad_code');
      end if;
    elsif not is_recital_family(v_student) then
      return jsonb_build_object('ok', false, 'code', 'not_eligible');
    end if;
  end if;

  -- One reservation at a time from here to the end of this request. The
  -- next family waits a few milliseconds, then sees the updated counts.
  perform pg_advisory_xact_lock(hashtext('shine_recital_ticket_reservations'));

  -- Per-family limit. Waitlisted tickets count too (see migration 33).
  v_scope := coalesce(s.family_cap_scope, case when s.capacity_mode = 'per_show' then 'per_show' else 'total' end);
  select coalesce(sum(ticket_count), 0) into v_have
  from ticket_reservations
  where lower(email) = v_email and status in ('confirmed', 'waitlist')
    and (v_scope <> 'per_show' or show_id = p_show_id);
  if v_have + p_count > v_max then
    return jsonb_build_object('ok', false, 'code', 'cap', 'have', v_have, 'max', v_max, 'scope', v_scope);
  end if;

  -- Seats left. Null means no limit has been set.
  if s.capacity_mode = 'per_show' then
    if sh.capacity is null then v_left := null;
    else
      select sh.capacity - coalesce(sum(ticket_count), 0) into v_left
      from ticket_reservations where status = 'confirmed' and show_id = p_show_id;
    end if;
  else
    if s.combined_capacity is null then v_left := null;
    else
      select s.combined_capacity - coalesce(sum(ticket_count), 0) into v_left
      from ticket_reservations where status = 'confirmed';
    end if;
  end if;

  -- Fill what fits, waitlist the rest.
  v_confirmed := case when v_left is null then p_count else least(p_count, greatest(v_left, 0)) end;
  v_wait := p_count - v_confirmed;
  v_phase := case when v_released then 'release' else 'initial' end;

  if v_confirmed > 0 then
    insert into ticket_reservations (show_id, parent_name, email, phone, student_name, ticket_count, status, phase)
    values (p_show_id, v_parent, v_email, v_phone, v_student, v_confirmed, 'confirmed', v_phase) returning id into v_id;
    v_ids := v_ids || v_id;
  end if;
  if v_wait > 0 then
    insert into ticket_reservations (show_id, parent_name, email, phone, student_name, ticket_count, status, phase)
    values (p_show_id, v_parent, v_email, v_phone, v_student, v_wait, 'waitlist', v_phase) returning id into v_id;
    v_ids := v_ids || v_id;
  end if;

  return jsonb_build_object('ok', true, 'confirmed', v_confirmed, 'waitlisted', v_wait, 'show_name', sh.name, 'ids', to_jsonb(v_ids));
end $$;

revoke all on function reserve_tickets(uuid, text, text, text, text, integer, text) from public;
grant execute on function reserve_tickets(uuid, text, text, text, text, integer, text) to anon, authenticated;

-- 2 -------------------------------------------------------------------
alter table recital_settings add column if not exists auto_reminder_enabled boolean not null default false;
alter table recital_settings add column if not exists auto_reminder_days integer not null default 2;

-- Verify. First result: one row, auto reminder off, 2 days.
-- Second result: exactly one reserve_tickets, with seven inputs.
-- Third result: one rule on recital_show_codes, "admins manage show codes".
select id, auto_reminder_enabled, auto_reminder_days from recital_settings;
select proname, pronargs as inputs from pg_proc where proname = 'reserve_tickets';
select tablename, policyname from pg_policies where tablename = 'recital_show_codes';
