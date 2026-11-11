-- Migration 40 — the waitlist emails become editable.
--
-- RUN THIS AFTER migration-39, BEFORE pushing the new shine-admin code.
-- Saving on the Recital Tickets settings screen will fail with an
-- "unknown column" error until it has been run.
--
-- Migration 39 sent two fixed pieces of wording that Corrie could not
-- change: the email a family gets when a show is full and ALL their
-- tickets are waitlisted, and the one line added to the confirmation
-- email when only SOME of their tickets are waitlisted. Both now come
-- from recital_settings, so she can reword them each year herself.
--
--   waitlist_subject / waitlist_body   the "you are on the waitlist" email
--   waitlist_note                      the line added to a confirmation
--                                      when part of the request is waitlisted
--
-- Left blank, the built-in wording is used, exactly as before.
--
-- Safe to re-run.

alter table recital_settings add column if not exists waitlist_subject text;
alter table recital_settings add column if not exists waitlist_body text;
alter table recital_settings add column if not exists waitlist_note text;

-- Same function as migration 39, now also handing back the waitlist wording.
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
    'subject', s.confirm_subject, 'body', s.confirm_body,
    'waitlist_subject', s.waitlist_subject, 'waitlist_body', s.waitlist_body, 'waitlist_note', s.waitlist_note
  );
end $$;

revoke all on function claim_ticket_confirmation(uuid[]) from public;
grant execute on function claim_ticket_confirmation(uuid[]) to anon, authenticated;

-- Verify. Should return one row with three empty (NULL) columns.
select id, waitlist_subject, waitlist_body, waitlist_note from recital_settings;
