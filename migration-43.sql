-- Migration 43 — safe class registration (step 1 of 2).
--
-- RUN THIS IN SUPABASE BEFORE PUSHING THE NEW shine-public CODE.
-- It only ADDS things. The live site keeps working exactly as it does now
-- until the new code is pushed. Step 2 (migration 44) closes the old path
-- and is run AFTER the new site is live and tested.
--
-- WHAT WAS WRONG
-- The public registration form decided in the visitor's own browser
-- whether a class had room, then wrote the family, student and enrollment
-- into the database as four separate steps. So:
--   - several families registering at the same moment could all be
--     "enrolled" in the last spot of a class,
--   - anyone could skip the form and write whatever they liked,
--   - a failure halfway left a family saved with no student, and
--   - if the seat count could not be read, everyone was enrolled anyway.
-- The registration email function also trusted the browser for who to
-- email and what to say, so it could be used to send Shine-branded email
-- to any address.
--
-- WHAT THIS ADDS
--   register_student()            does the whole registration in ONE step,
--                                 one family at a time: every check, the
--                                 seat count, and all the saving. If any
--                                 part fails, nothing is saved.
--   claim_registration_email()    hands the email function what to send,
--                                 from the database, once per registration.
--   Size limits on the interest and volunteer forms.
--   The public can no longer read each class's helper, greeter and TA
--   names (the website never showed them, but they were readable).
--
-- Safe to re-run.

alter table registrations add column if not exists outcomes jsonb;
alter table registrations add column if not exists email_sent_at timestamptz;

-- ---------------------------------------------------------------------
-- The one way a family registers. Takes the form as JSON. Returns:
--   { ok: true, registration_id, outcomes: [{ name, when, status }] }
--     status is 'enrolled' or 'waitlist'
--   { ok: false, code }   code is 'closed' or 'bad_input'
create or replace function register_student(p jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  f_pf text := left(trim(coalesce(p->>'parent_first_name', '')), 80);
  f_pl text := left(trim(coalesce(p->>'parent_last_name', '')), 80);
  f_email text := left(trim(coalesce(p->>'email', '')), 254);
  f_phone text := left(trim(coalesce(p->>'phone', '')), 40);
  f_sf text := left(trim(coalesce(p->>'student_first_name', '')), 80);
  f_sl text := left(trim(coalesce(p->>'student_last_name', '')), 80);
  f_grade text := nullif(left(trim(coalesce(p->>'student_grade', '')), 40), '');
  f_age text := nullif(left(trim(coalesce(p->>'student_age', '')), 20), '');
  f_bday date;
  f_p2n text := nullif(left(trim(coalesce(p->>'secondary_parent_name', '')), 160), '');
  f_p2e text := nullif(left(trim(coalesce(p->>'secondary_parent_email', '')), 254), '');
  f_p2p text := nullif(left(trim(coalesce(p->>'secondary_parent_phone', '')), 40), '');
  f_p3n text := nullif(left(trim(coalesce(p->>'tertiary_parent_name', '')), 160), '');
  f_p3e text := nullif(left(trim(coalesce(p->>'tertiary_parent_email', '')), 254), '');
  f_p3p text := nullif(left(trim(coalesce(p->>'tertiary_parent_phone', '')), 40), '');
  f_ecn text := nullif(left(trim(coalesce(p->>'emergency_contact_name', '')), 160), '');
  f_ecr text := nullif(left(trim(coalesce(p->>'emergency_contact_relationship', '')), 80), '');
  f_ecp text := nullif(left(trim(coalesce(p->>'emergency_contact_phone', '')), 40), '');
  f_heard text := nullif(left(trim(coalesce(p->>'heard_about', '')), 300), '');
  f_returning boolean := coalesce(p->>'is_returning', '') = 'true';
  f_m1 boolean := coalesce(p->>'meeting_aug28', '') = 'true';
  f_m2 boolean := coalesce(p->>'meeting_sep3', '') = 'true';
  f_donate boolean := coalesce(p->>'wants_donation', '') = 'true';
  f_not_sure boolean := coalesce(p->>'not_sure', '') = 'true';
  v_open text;
  v_reg uuid := gen_random_uuid();
  v_fam uuid := gen_random_uuid();
  v_stu uuid := gen_random_uuid();
  v_ids uuid[] := '{}';
  v_raw text;
  c record;
  v_n integer; v_status text;
  v_outcomes jsonb := '[]'::jsonb;
  v_names text[] := '{}';
  v_meeting_note text;
begin
  -- A hidden box real people never see or fill. A bot that fills every
  -- box is told "ok" and nothing is saved.
  if length(coalesce(p->>'website', '')) > 0 then
    return jsonb_build_object('ok', true, 'registration_id', null, 'outcomes', '[]'::jsonb);
  end if;

  -- Corrie can close registration from Admin > Site Content. Anything
  -- other than an explicit "no" means open, which is how it has always been.
  select value into v_open from site_content where key = 'registration_open';
  if lower(trim(coalesce(v_open, ''))) = 'no' then
    return jsonb_build_object('ok', false, 'code', 'closed');
  end if;

  if f_pf = '' or f_pl = '' or f_sf = '' or f_sl = '' or f_phone = ''
     or f_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('ok', false, 'code', 'bad_input');
  end if;

  -- A birthday that is not a real date is dropped, never an error.
  begin
    if coalesce(p->>'student_birthday', '') ~ '^\d{4}-\d{2}-\d{2}$' then f_bday := (p->>'student_birthday')::date; end if;
  exception when others then f_bday := null;
  end;

  -- Chosen classes: only well-formed ids, no repeats, at most 20.
  if not f_not_sure and jsonb_typeof(p->'class_ids') = 'array' then
    for v_raw in select jsonb_array_elements_text(p->'class_ids') limit 20 loop
      if v_raw ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' and not (v_raw::uuid = any(v_ids)) then
        v_ids := v_ids || v_raw::uuid;
      end if;
    end loop;
  end if;

  -- One registration at a time from here to the end, so two families can
  -- never both read "one spot left".
  perform pg_advisory_xact_lock(hashtext('shine_class_registration'));

  -- Work out each class first, so the records below can say what happened.
  for c in select * from classes where id = any(v_ids) and active = true order by name loop
    select count(*) into v_n from enrollments where class_id = c.id and status = 'enrolled';
    v_status := case when c.capacity is not null and c.capacity > 0 and v_n >= c.capacity then 'waitlist' else 'enrolled' end;
    v_outcomes := v_outcomes || jsonb_build_object(
      'class_id', c.id, 'name', c.name, 'status', v_status,
      'when', trim(concat_ws(' ', nullif(c.day_of_week, ''),
        case when coalesce(c.start_time::text, '') <> '' then c.start_time::text || case when coalesce(c.end_time::text, '') <> '' then '–' || c.end_time::text else '' end end)));
    v_names := v_names || c.name;
  end loop;

  insert into registrations (
    id, parent_name, email, phone, student_name, student_grade, student_age, student_birthday,
    secondary_parent_name, secondary_parent_email, secondary_parent_phone,
    tertiary_parent_name, tertiary_parent_email, tertiary_parent_phone,
    emergency_contact_name, emergency_contact_relationship, emergency_contact_phone,
    interested_class, heard_about, is_returning, meeting_aug28, meeting_sep3, meeting_acknowledged,
    wants_donation, waiver_acknowledged, processed, submitted_date, outcomes
  ) values (
    v_reg, f_pf || ' ' || f_pl, f_email, f_phone, f_sf || ' ' || f_sl, f_grade, f_age, f_bday,
    f_p2n, f_p2e, f_p2p, f_p3n, f_p3e, f_p3p, f_ecn, f_ecr, f_ecp,
    case when array_length(v_names, 1) is null then 'Not sure yet — help me choose' else array_to_string(v_names, ', ') end,
    f_heard, f_returning, f_m1, f_m2, true, f_donate, true, true, now(), v_outcomes
  );

  insert into families (
    id, parent_first_name, parent_last_name, email, phone,
    secondary_parent_name, secondary_parent_email, secondary_parent_phone,
    tertiary_parent_name, tertiary_parent_email, tertiary_parent_phone,
    emergency_contact_name, emergency_contact_relationship, emergency_contact_phone, notes
  ) values (
    v_fam, f_pf, f_pl, f_email, f_phone, f_p2n, f_p2e, f_p2p, f_p3n, f_p3e, f_p3p, f_ecn, f_ecr, f_ecp,
    case when f_donate then 'Registration donation intent noted at signup.' end
  );

  v_meeting_note := nullif(concat_ws(' + ', case when f_m1 then 'Aug 28 meeting' end, case when f_m2 then 'Sep 3 meeting' end), '');
  insert into students (id, first_name, last_name, grade, age, birthday, family_id, season_status, notes)
  values (
    v_stu, f_sf, f_sl, f_grade, f_age, f_bday, v_fam,
    case when array_length(v_names, 1) is null then 'inactive' else 'active' end,
    concat_ws(' ',
      case when v_meeting_note is not null then 'Parent meeting selected at registration: ' || v_meeting_note || '.' end,
      case when f_returning then 'Registered as a returning student.' else 'Registered as a new student.' end)
  );

  insert into enrollments (student_id, class_id, status)
  select v_stu, (o->>'class_id')::uuid, o->>'status' from jsonb_array_elements(v_outcomes) o;

  return jsonb_build_object('ok', true, 'registration_id', v_reg, 'outcomes', v_outcomes);
end $$;

revoke all on function register_student(jsonb) from public;
grant execute on function register_student(jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Called by the public site's email function right after a registration.
-- Returns what to send, from the database, and marks it sent so the same
-- registration can never trigger a second pair of emails. Only answers
-- for a registration made in the last 15 minutes.
create or replace function claim_registration_email(p_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare r registrations%rowtype; v_l1 text; v_l2 text; v_req text;
begin
  update registrations set email_sent_at = now()
  where id = p_id and email_sent_at is null and submitted_date > now() - interval '15 minutes'
  returning * into r;
  if not found then return jsonb_build_object('send', false); end if;
  select value into v_l1 from site_content where key = 'meeting_aug28_label';
  select value into v_l2 from site_content where key = 'meeting_sep3_label';
  select value into v_req from site_content where key = 'meetings_required';
  return jsonb_build_object(
    'send', true,
    'record', to_jsonb(r) - 'outcomes' - 'email_sent_at',
    'outcomes', coalesce(r.outcomes, '[]'::jsonb),
    'meeting_labels', jsonb_build_object('aug28', nullif(v_l1, ''), 'sep3', nullif(v_l2, '')),
    'meetings_required', lower(trim(coalesce(v_req, ''))) <> 'no'
  );
end $$;

revoke all on function claim_registration_email(uuid) from public;
grant execute on function claim_registration_email(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Size limits on the two forms that still save directly. Before this,
-- a single message could be hundreds of thousands of characters.
drop policy if exists "public can submit contact interest" on contact_interest;
create policy "public can submit contact interest" on contact_interest for insert
  with check (length(name) between 1 and 160 and coalesce(length(email), 0) <= 254
    and coalesce(length(phone), 0) <= 40 and coalesce(length(message), 0) <= 4000);

drop policy if exists "public can submit volunteer" on volunteer_inquiries;
create policy "public can submit volunteer" on volunteer_inquiries for insert
  with check (length(name) between 1 and 160 and coalesce(length(email), 0) <= 254
    and coalesce(length(phone), 0) <= 40 and coalesce(length(message), 0) <= 4000
    and coalesce(processed, false) = false);

-- ---------------------------------------------------------------------
-- The public may read the class details the website shows, and nothing
-- else on a class. Left out on purpose: class_mom (helper), assistant_name
-- (greeter), ta_name and teacher_id. Signed-in staff are not affected.
revoke select on classes from anon;
grant select (id, name, level, day_of_week, start_time, end_time, location, capacity,
  instructor_name, active, created_at, min_age, max_age, season, room_id, in_recital) on classes to anon;

-- Verify. First result: the two new functions. Second: both forms'
-- rules are listed. Third: the helper columns are NOT in the list.
select proname from pg_proc where proname in ('register_student', 'claim_registration_email') order by 1;
select tablename, policyname from pg_policies where tablename in ('contact_interest', 'volunteer_inquiries') and cmd = 'INSERT' order by 1;
select string_agg(column_name, ', ' order by column_name) as columns_the_public_can_read
from information_schema.column_privileges where table_name = 'classes' and grantee = 'anon' and privilege_type = 'SELECT';
