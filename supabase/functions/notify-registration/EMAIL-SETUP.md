# Registration email notifications — setup (~20 min, one time)

Goal: when a parent registers on the public site, Corrie gets an email.

## 1. Resend account (the email sender)
1. Create a free account at resend.com.
2. API Keys → Create API Key. Copy it.
3. IMPORTANT — Resend's free tier only delivers to YOUR OWN account email
   until you verify a domain. Two options:
   - Best: verify the ghfc.org domain (Domains → Add Domain → add the DNS
     records shown — whoever manages the church's website DNS can do this).
     Then set FROM_EMAIL to something like "Shine <shine@ghfc.org>" and
     NOTIFY_EMAIL to shineGHFC@gmail.com.
   - Quick bridge: create the Resend account WITH the email that should get
     the notifications, and set NOTIFY_EMAIL to that address. A Gmail
     forwarding rule can pass it along to Corrie.

## 2. Create the Edge Function in Supabase
1. Supabase dashboard → Edge Functions → Deploy a new function
   (choose "via editor" — no command line needed).
2. Name it exactly: notify-registration
3. Paste the contents of index.ts (this folder) and deploy.
4. Edge Functions → notify-registration → Details: turn OFF "Verify JWT"
   (the webhook calls it server-to-server).

## 3. Add the secrets
Supabase → Edge Functions → Secrets (or Project Settings → Functions):
- RESEND_API_KEY = the key from step 1
- NOTIFY_EMAIL   = shineGHFC@gmail.com   (or per the caveat above)
- FROM_EMAIL     = Shine <shine@ghfc.org>   (only after domain verification;
                   otherwise leave unset)

## 4. Wire the webhook
Supabase → Database → Webhooks → Create a new hook:
- Name: registration-email
- Table: registrations
- Events: INSERT only
- Type: Supabase Edge Function → pick notify-registration
Save.

## 5. Test
Submit a fake registration on the public site. The email should arrive in
under a minute. Delete the fake from the admin tool afterward.

If no email: Edge Functions → notify-registration → Logs shows what happened.

---

# Class broadcast emails ("Send from Shine")

The Enrollments screen's "Email class" works two ways:
- "Open in my email app" — works immediately, no setup. Pre-fills a BCC draft
  in Corrie's own email.
- "Send from Shine" — sends directly from the tool. Needs the setup below,
  and REQUIRES the ghfc.org domain verified in Resend (Resend will not send
  to parents' addresses otherwise).

Setup (after the registration-email setup above):
1. Resend → Domains → verify ghfc.org (add the DNS records shown).
2. Supabase → Edge Functions → Deploy new function, name it exactly:
   send-broadcast — paste index.ts from supabase/functions/send-broadcast.
3. Leave "Verify JWT" ON for this one (only logged-in staff may send).
4. Secrets (shared with the other function): RESEND_API_KEY, plus
   FROM_EMAIL = Shine Dance Studio <shine@ghfc.org>
5. Test from Enrollments: pick a class, Email class, send yourself one first
   (temporarily enroll a test student whose family email is yours).
