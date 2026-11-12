# Shine Dance Studio — Staff Management Tool

The internal tool for managing classes, students, families, and enrollments. Replaces the spreadsheets. Reads and writes to a Supabase database that the public site shares.

## What it does

- **Dashboard** — counts of students, families, active classes, and new registrations.
- **Enrollments** — the daily driver. Put a student in a class, move them, waitlist, or drop, each in one click.
- **Classes** — add, edit, or retire classes. Retired classes drop off the public schedule automatically.
- **Students** — every dancer, linked to a family.
- **Families** — parent contacts and emergency info.
- **Registrations** — a log of everyone who registered through the public site. Registering already creates the family, student and enrollment, so nothing here needs approving.
- **Teachers** — your teaching team's contact info in one place. Names entered here appear as suggestions when setting a class instructor.
- **Attendance** — pick a class and a date, check off who's present, save. Tap a row to toggle.
- **Photos** — upload the public site's hero photo and gallery photos right from a phone. No code needed.
- **Announcements** — post breaks/closures with optional start and end dates; they appear as a banner on the public site and expire automatically.
- **Recital Tickets** — shows, seat counts, an access code per show, the public tickets page (hidden, coming soon or open), reservations, printed tickets, the door list, and recital emails including an automatic reminder before each show.
- **Teacher Access** — limited logins for teachers, and which screens each one can see.
- **Privacy Settings** — what is allowed to appear on printed rosters and lists.

## First-time setup (about 10 minutes)

### 1. Create the Supabase project
- Go to supabase.com, create a new project. Pick a strong database password and save it.
- When it finishes provisioning, open the **SQL Editor**, paste the entire contents of `schema.sql`, and run it.
- Then run every `migration-N.sql` file in number order, one at a time, **skipping 2, 3, 4 and 9**. Those four are already built into `schema.sql`, and running them again stops with an "already exists" error.
- `schema.sql` on its own is NOT the full database. It is the starting point, and the migrations bring it up to date. (Checked November 2026: this exact sequence, through migration 42, builds the same database as the live one.)
- Never edit a migration that has already been run. A change goes in a new, higher-numbered migration file.

### 2. Create your first staff login
- In Supabase, go to **Authentication > Users > Add user**.
- Enter an email and password for the leader. Repeat for each volunteer who needs edit access.
- **Turn off public sign-ups.** In Supabase, go to **Authentication > Sign In / Providers** and switch off "Allow new users to sign up". This matters: any login that is not listed on the Teacher Access screen is a full admin, so sign-ups must be closed. The app has no sign-up screen, but that alone does not close it.
- A teacher's limited login is created here too, then given its limits on the Teacher Access screen right away. Until that row is saved, the new login is a full admin.
- To remove someone, use **Remove** on the Teacher Access screen. It deletes the login itself.

### 3. Connect the app to Supabase
- In Supabase, go to **Project Settings > API**. Copy the **Project URL** and the **anon public** key.
- In this project, copy `.env.example` to a new file named `.env` and paste those two values in.

### 4. Run it
    npm install
    npm run dev

Open the local URL it prints. Sign in with the staff login you created.

## Deploying to Netlify
- Push this folder to a GitHub repo.
- In Netlify, "Add new site" -> "Import an existing project," import that repo.
- Under **Site configuration -> Environment variables**, add:
  - `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, the same values as your .env.
  - `GMAIL_ADDRESS` and `GMAIL_APP_PASSWORD`, for every email this tool sends. If the app password is ever regenerated, update it on BOTH Netlify sites (this one and the public site) at the same time.
  - `SUPABASE_SERVICE_ROLE_KEY`, for the password reset, login removal and meeting reminder functions. This key is a master password for the whole database. Never give it a `VITE_` prefix, never add it to the public site, never commit it, and never paste it into a chat or email.
- Deploy. Vite only bakes environment variables in at build time, so if you add or change one later, trigger a fresh deploy for it to take effect.

## Handoff to a new owner

Moving this to someone else's accounts:
1. They create their own Supabase project and build the database as described in "Create the Supabase project" above (`schema.sql`, then the migrations).
2. Export data from the old project and import to the new one (Supabase's table export, or a pg_dump).
3. They point their .env (and Netlify env vars) at their new project's URL and key.
4. Transfer or re-clone the GitHub repo to their account and redeploy.

No data lives only in the app. The database is the source of truth, and `schema.sql` plus the migrations rebuild its structure anywhere.

## Notes
- This is the free-ministry version: no billing or tuition by design. Recital tickets are free reservations, not sales.
- The `netlify/functions` folder holds the server-side pieces (email, password reset, login removal, meeting reminders). The scheduled meeting reminder runs at 01:00 UTC, which is 5 PM Pacific in winter and 6 PM in summer. The scheduled recital reminder runs at 17:00 UTC, which is 9 AM Pacific in winter and 10 AM in summer.
- The public site is a separate project that shares this same Supabase database.
