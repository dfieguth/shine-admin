-- Migration 39 — overbooking protection and confirmation emails for
-- recital tickets.
--
-- RUN THIS IN SUPABASE BEFORE PUSHING THE NEW shine-public CODE.
-- Order matters this time: this migration stops the public page from
-- writing reservations directly, so the OLD public page cannot save a
-- reservation once this has run. (The tickets page is hidden right now,
-- so families are not affected. Just push the new public code soon after.)
--
-- WHAT WAS WRONG
-- The public page checked seats, the per-family limit and the
-- performers-only rule in the visitor's own browser, then saved the
-- reservation. Two problems:
--   1. Several families reserving the last seats at the same moment could
--      all pass the check and all be confirmed, putting a show over.
--   2. The browser was trusted. Anyone could skip the page and write a
--      "confirmed" reservation straight into the table.
--
-- WHAT THIS DOES
--   reserve_tickets()   one database function that does every check and
--                       saves the reservation in a single step. Requests
--                       are handled one at a time, so the seat count can
--                       never be read by two families at once.
--   The public can no longer insert into ticket_reservations directly.
--   claim_ticket_confirmation()   hands the email function what it needs
--                       to send ONE confirmation for a reservation that
--                       was just made, and only while recital emails are
--                       switched on in the admin.
--   is_recital_family() no longer treats a dancer record with a blank
--                       first name as matching everybody.
--
-- Safe to re-run.

alter table ticket_reservations add column if not exists confirmation_sent_at timestamptz;

-- ---------------------------------------------------------------------
-- Performers-only check. Same soft name match as before, minus one hole:
-- "the typed name contains the dancer's first name" was true for EVERY
-- typed name when a dancer's first name was blank.
create or replace function is_recital_family(check_name text)
returns boolean
language sql security definer set search_path = public as $$
  select length(trim(coalesce(check_name, ''))) >= 2 and exists (
    select 1
    from students st
    join enrollments e on e.student_id = st.id and e.status = 'enrolled'
    join classes c on c.id = e.class_id and c.in_recital = true
    where length(trim(coalesce(st.first_name, ''))) > 0
      and (
        lower(st.first_name || ' ' || coalesce(st.last_name, '')) like '%' || lower(trim(check_name)) || '%'
        or lower(check_name) like '%' || lower(trim(st.first_name)) || '%'
      )
  );
$$;

-- ---------------------------------------------------------------------
-- The one way a family reserves tickets. Returns JSON:
--   { ok: true,  confirmed, waitlisted, show_name, ids: [...] }
--   { ok: false, code, ... }   code is one of: closed, bad_input, no_show,
--                              not_eligible, cap
create or replace function reserve_tickets(
  p_show_id uuid, p_parent_name text, p_email text, p_phone text, p_student_name text, p_count integer
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
  v_phase text; v_ids uuid[] := '{}'; v_id uuid;
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

  -- One reservation at a time from here to the end of this request. The
  -- next family waits a few milliseconds, then sees the updated counts.
  perform pg_advisory_xact_lock(hashtext('shine_recital_ticket_reservations'));

  v_released := coalesce(s.released, false) or (s.reservation_deadline is not null and s.reservation_deadline <= now());
  if not v_released and not is_recital_family(v_student) then
    return jsonb_build_object('ok', false, 'code', 'not_eligible');
  end if;

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

revoke all on function reserve_tickets(uuid, text, text, text, text, integer) from public;
grant execute on function reserve_tickets(uuid, text, text, text, text, integer) to anon, authenticated;

-- The browser can no longer write reservations directly. Staff keep full
-- access through the existing "staff manage reservations" policy.
drop policy if exists "public insert reservations" on ticket_reservations;

-- ---------------------------------------------------------------------
-- Called by the public site's email function right after a reservation.
-- Hands back what is needed to send ONE confirmation, and marks it sent so
-- the same reservation can never trigger a second email. The recipient and
-- wording come from the database, never from the visitor's browser.
-- Returns { send: false } when emails are off, the reservation is not
-- brand new, or it was already emailed.
create or replace function claim_ticket_confirmation(p_ids uuid[])
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s recital_settings%rowtype;
  sh recital_shows%rowtype;
  v_email text; v_parent text; v_show uuid; v_confirmed integer; v_wait integer; v_n integer;
begin
  select * into s from recital_settings where id = 1;
  if not found or not coalesce(s.emails_enabled, false) then return jsonb_build_object('send', false, 'reason', 'emails_off'); end if;
  if p_ids is null or array_length(p_ids, 1) is null or array_length(p_ids, 1) > 2 then return jsonb_build_object('send', false, 'reason', 'bad_request'); end if;

  select count(*), count(distinct lower(email)), count(distinct show_id) into v_n, v_confirmed, v_wait
  from ticket_reservations
  where id = any(p_ids) and confirmation_sent_at is null and created_at > now() - interval '15 minutes';
  -- Every id must be a fresh, un-emailed row, all for one family and one show.
  if v_n <> array_length(p_ids, 1) or v_confirmed <> 1 or v_wait <> 1 then return jsonb_build_object('send', false, 'reason', 'not_claimable'); end if;

  select min(lower(email)), min(parent_name), min(show_id::text)::uuid,
         coalesce(sum(ticket_count) filter (where status = 'confirmed'), 0),
         coalesce(sum(ticket_count) filter (where status = 'waitlist'), 0)
    into v_email, v_parent, v_show, v_confirmed, v_wait
  from ticket_reservations where id = any(p_ids);

  update ticket_reservations set confirmation_sent_at = now() where id = any(p_ids);
  select * into sh from recital_shows where id = v_show;

  return jsonb_build_object(
    'send', true, 'email', v_email, 'parent_name', v_parent,
    'show_name', sh.name, 'show_date', sh.show_date, 'show_time', sh.show_time,
    'confirmed', v_confirmed, 'waitlisted', v_wait,
    'subject', s.confirm_subject, 'body', s.confirm_body
  );
end $$;

revoke all on function claim_ticket_confirmation(uuid[]) from public;
grant execute on function claim_ticket_confirmation(uuid[]) to anon, authenticated;

-- Verify. Should return three rows, and NO row named
-- "public insert reservations" in the second result.
select proname from pg_proc where proname in ('reserve_tickets', 'claim_ticket_confirmation', 'is_recital_family') order by proname;
select policyname, cmd from pg_policies where tablename = 'ticket_reservations' order by policyname;
