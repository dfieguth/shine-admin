-- Migration 33 — the 6-tickets-per-family cap needs to count WAITLISTED
-- tickets too, not just confirmed ones.
--
-- Why this changed: a reservation request can now split across both
-- statuses. If a family asks for 4 and only 2 seats remain, they get 2
-- confirmed and 2 waitlisted, rather than all 4 waitlisted while 2 real
-- seats sit empty. But the cap check only counted CONFIRMED tickets, so
-- that same family could come back and request 4 more — ending up with 6
-- confirmed plus 2 still on the waitlist, which is 8 against a 6 cap.
--
-- Counting both statuses is the correct reading of "6 max per family":
-- a waitlisted ticket is a claim on a seat, and if it gets promoted it
-- becomes a real seat. It should count against the cap the whole time.
--
-- Safe to re-run.

create or replace function ticket_count_for_email(check_email text, check_show_id uuid default null)
returns integer
language sql security definer as $$
  select coalesce(sum(ticket_count), 0)::integer
  from ticket_reservations
  where lower(email) = lower(check_email)
    and status in ('confirmed', 'waitlist')
    and (check_show_id is null or show_id = check_show_id);
$$;
