-- Migration 25 — give students a real `age` column.
--
-- Age was only ever being saved as free text buried inside the `notes`
-- field ("Age at registration: 8."), which meant it could never be shown
-- as a real column or sorted/filtered on. This adds a proper column and
-- the registration form now saves into it directly.
--
-- Kept as text, not integer, matching how `grade` is already stored — the
-- registration field itself is loosely validated (placeholder "e.g. 8"),
-- so a text column avoids a failed insert if someone types something
-- slightly non-numeric.
--
-- Existing students keep whatever's already in their `notes` field as-is;
-- this does not attempt to retroactively parse age out of old notes text,
-- since that's unreliable to do automatically. New registrations from here
-- forward populate the real column.
--
-- Safe to re-run.

alter table students add column if not exists age text;
