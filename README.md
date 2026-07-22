# Shine Dance Studio — Staff Management Tool

The internal tool for managing classes, students, families, and enrollments. Replaces the spreadsheets. Reads and writes to a Supabase database that the public site shares.

## What it does

- **Dashboard** — counts of students, families, active classes, and new registrations.
- **Enrollments** — the daily driver. Put a student in a class, move them, waitlist, or drop, each in one click.
- **Classes** — add, edit, or retire classes. Retired classes drop off the public schedule automatically.
- **Students** — every dancer, linked to a family.
- **Families** — parent contacts and emergency info.
- **Registrations** — new sign-ups from the public site land here. Review one, click "Add to roster," and it creates the family + student + enrollment for you.
- **Teachers** — your teaching team's contact info in one place. Names entered here appear as suggestions when setting a class instructor.
- **Attendance** — pick a class and a date, check off who's present, save. Tap a row to toggle.
- **Photos** — upload the public site's hero photo and gallery photos right from a phone. No code needed.
- **Announcements** — post breaks/closures with optional start and end dates; they appear as a banner on the public site and expire automatically.

## First-time setup (about 10 minutes)

### 1. Create the Supabase project
- Go to supabase.com, create a new project. Pick a strong database password and save it.
- When it finishes provisioning, open the **SQL Editor**, paste the entire contents of `schema.sql`, and run it. This creates all the tables and security rules.

### 2. Create your first staff login
- In Supabase, go to **Authentication > Users > Add user**.
- Enter an email and password for the leader. Repeat for each volunteer who needs edit access.
- (There is no public sign-up. Only users you add here can log in. That is intentional.)

### 3. Connect the app to Supabase
- In Supabase, go to **Project Settings > API**. Copy the **Project URL** and the **anon public** key.
- In this project, copy `.env.example` to a new file named `.env` and paste those two values in.

### 4. Run it
    npm install
    npm run dev

Open the local URL it prints. Sign in with the staff login you created.

## Deploying to Vercel
- Push this folder to a GitHub repo.
- In Vercel, "Add New Project," import that repo.
- Under **Environment Variables**, add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY with the same values from your .env.
- Deploy. Done.

## Handoff to a new owner

Because schema.sql holds the whole database structure, moving this to someone else's accounts is quick:
1. They create their own Supabase project and run schema.sql in its SQL Editor.
2. Export data from the old project and import to the new one (Supabase's table export, or a pg_dump).
3. They point their .env (and Vercel env vars) at their new project's URL and key.
4. Transfer or re-clone the GitHub repo to their account and redeploy.

No data lives only in the app. The database is the source of truth, and schema.sql rebuilds it anywhere.

## Notes
- This is the free-ministry version: no billing, tuition, costumes, or recitals by design.
- The public site is a separate project that shares this same Supabase database.
