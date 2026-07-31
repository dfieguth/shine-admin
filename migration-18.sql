-- Migration 18 — capture "how did you hear about us?" at registration.
-- Safe to re-run: IF NOT EXISTS guards against the "already exists" error
-- that's come up repeatedly with this project's consolidated SQL files.

alter table registrations
  add column if not exists heard_about text;
