# Email notifications — setup via Gmail (no DNS, no domain verification)

Goal: when a parent registers, Corrie gets an email. When she clicks "Send
from Shine" on a class broadcast, it actually sends. Both now go through
Shine's real Gmail account (shineGHFC@gmail.com) instead of a third-party
sending service — this means NO domain ownership proof, NO DNS records,
and nothing for church IT to set up. Whoever has the Gmail password for
shineGHFC@gmail.com can do this alone, in about 10 minutes.

## 1. Turn on 2-Step Verification (if not already on)
Gmail requires this before it will generate an app password.
Go to myaccount.google.com → Security → 2-Step Verification → turn it on
for shineGHFC@gmail.com (needs a phone number to confirm once).

## 2. Generate an App Password
Still in myaccount.google.com → Security → search "App passwords" (or go to
myaccount.google.com/apppasswords). Create one, name it "Shine Admin Tool."
Google gives you a 16-character code like `abcd efgh ijkl mnop`. Copy it —
this is NOT the normal Gmail password, it's a separate code made just for
this purpose, and Google only shows it once.

## 3. Add two Edge Function secrets in Supabase
Supabase → Edge Functions → Secrets (or Project Settings → Functions):
- GMAIL_ADDRESS = shineGHFC@gmail.com
- GMAIL_APP_PASSWORD = the 16-character code from step 2 (remove spaces)
- NOTIFY_EMAIL = shineGHFC@gmail.com  (optional — who gets registration alerts;
  defaults to GMAIL_ADDRESS if not set)

## 4. Deploy the two functions
Supabase → Edge Functions → Deploy a new function (via editor, no command
line needed):
- Name: notify-registration → paste index.ts from this folder
- Name: send-broadcast → paste index.ts from supabase/functions/send-broadcast
For send-broadcast specifically: leave "Verify JWT" ON (only logged-in staff
may trigger it). For notify-registration, turn "Verify JWT" OFF (the database
webhook calls it server-to-server, not as a logged-in user).

## 5. Wire the registration webhook
Supabase → Database → Webhooks → Create a new hook:
- Name: registration-email
- Table: registrations
- Events: INSERT only
- Type: Supabase Edge Function → pick notify-registration
Save.

## 6. Test
- Submit a fake registration on the public site → an email should land in
  shineGHFC@gmail.com within a minute.
- In the admin, Enrollments → pick a class → Email class → Send from Shine
  → should actually send now.
Delete any fake test data afterward.

## If something fails
Edge Functions → [function name] → Logs shows the actual error. The most
common one is a wrong or spaced app password — regenerate it in step 2 if so.
