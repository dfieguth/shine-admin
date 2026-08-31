// Shine — automatic parent meeting reminders, one evening before each
// Mandatory Parent Meeting. Runs on a schedule (see netlify.toml), not
// triggered by anyone clicking anything.
//
// HOW IT DECIDES A REMINDER IS DUE:
// Site Content has two REAL, structured dates (meeting_aug28_date,
// meeting_sep3_date) — separate from the free-text labels ("Friday,
// August 28th...") that parents actually read. The structured date is
// what this function compares against today's date; the free-text label
// is what gets dropped into the email body. Corrie only has to update
// the date field when she sets a new meeting — everything else follows
// automatically, which was the actual point of building this.
//
// RETRY WINDOW, ON PURPOSE: this doesn't only fire on the exact day
// before. It checks "is the meeting today OR tomorrow" — a 2-day window,
// not a single shot. If the run scheduled for the evening before a
// meeting fails for any reason (Gmail hiccup, anything), the NEXT day's
// run (now the day of the meeting itself) gets one more chance, instead
// of the reminder just silently never going out. A dedicated tracking
// table (meeting_reminders_sent) makes sure a meeting that already sent
// successfully never sends twice within that window.
//
// Environment variables needed on shine-admin (all already set for
// earlier features — nothing new required):
//   VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
//   GMAIL_ADDRESS, GMAIL_APP_PASSWORD

import { createClient } from '@supabase/supabase-js'
import nodemailer from 'nodemailer'

// Pacific-time "today" as YYYY-MM-DD — deliberately not server/UTC time.
// This project's meetings are all Pacific; comparing dates in UTC would
// risk an off-by-one around the actual evening this is meant to run.
function pacificDateString(offsetDays = 0) {
  const now = new Date(Date.now() + offsetDays * 86400000)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}
function pacificHour() {
  const h = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', hour12: false }).format(new Date()))
  // Some environments return 24 rather than 0 for midnight with
  // hour12:false — normalize so the morning/evening greeting check below
  // never misbehaves in that one edge hour.
  return h === 24 ? 0 : h
}

export const handler = async () => {
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const gmailAddress = process.env.GMAIL_ADDRESS
  const gmailAppPassword = process.env.GMAIL_APP_PASSWORD

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    console.error('send-meeting-reminders: missing Supabase env vars')
    return json(500, { ok: false, error: 'Not configured' })
  }
  if (!gmailAddress || !gmailAppPassword) {
    console.error('send-meeting-reminders: missing Gmail env vars')
    return json(500, { ok: false, error: 'Email not configured' })
  }

  const admin = createClient(supabaseUrl, serviceRoleKey)
  const today = pacificDateString(0)
  const tomorrow = pacificDateString(1)
  const greeting = pacificHour() < 12 ? 'Good morning' : 'Good evening'

  const { data: scRows, error: scErr } = await admin.from('site_content').select('key, value').in('key', [
    'meeting_aug28_date', 'meeting_sep3_date', 'meeting_aug28_label', 'meeting_sep3_label', 'parent_meeting_reminder_template',
  ])
  if (scErr) {
    console.error('send-meeting-reminders: could not load Site Content —', scErr)
    return json(500, { ok: false, error: scErr.message })
  }
  const sc = {}
  for (const row of scRows || []) sc[row.key] = row.value

  const template = sc.parent_meeting_reminder_template || 'Hi {{parent_name}},\n\n{{greeting}}! This is a reminder that {{student_name}}\'s Shine parent meeting is tomorrow: {{meeting_details}}, at Granada Heights Friends Church.\n\nGrace and Peace,\nCorrie Villa'

  const meetings = [
    { key: 'aug28', date: sc.meeting_aug28_date, label: sc.meeting_aug28_label, flagColumn: 'meeting_aug28' },
    { key: 'sep3', date: sc.meeting_sep3_date, label: sc.meeting_sep3_label, flagColumn: 'meeting_sep3' },
  ]

  const results = []
  for (const meeting of meetings) {
    if (!meeting.date) continue // no date set for this meeting yet — nothing to check
    const due = meeting.date === today || meeting.date === tomorrow
    if (!due) continue

    // Already sent for this specific meeting date? Skip — this is what
    // stops the 2-day retry window from double-sending once a run has
    // already succeeded.
    const { data: existing } = await admin.from('meeting_reminders_sent').select('sent_for_date').eq('meeting_key', meeting.key).eq('sent_for_date', meeting.date).maybeSingle()
    if (existing) {
      results.push({ meeting: meeting.key, skipped: 'already sent' })
      continue
    }

    // Only remind families who registered reasonably recently. The
    // meeting flag columns (meeting_aug28/meeting_sep3) are permanent once
    // set, and these two slots get REUSED every season with new dates. So
    // without this window, next season's reminder would also email this
    // season's families — who registered for a totally different meeting
    // that already happened, but still carry the flag. Scoping to
    // registrations from the ~4 months before the meeting date cleanly
    // separates one season's meeting from the next without needing a new
    // per-season data model. 120 days comfortably covers a normal
    // registration-to-meeting gap while excluding a prior season.
    const meetingDate = new Date(meeting.date + 'T00:00:00')
    const windowStart = new Date(meetingDate.getTime() - 120 * 86400000).toISOString()
    const { data: regs, error: regErr } = await admin.from('registrations').select('parent_name, student_name, email').eq(meeting.flagColumn, true).gte('submitted_date', windowStart)
    if (regErr) {
      console.error(`send-meeting-reminders: could not load registrations for ${meeting.key} —`, regErr)
      results.push({ meeting: meeting.key, error: regErr.message })
      continue
    }
    const recipients = (regs || []).filter((r) => r.email)
    if (!recipients.length) {
      results.push({ meeting: meeting.key, sent: 0, note: 'nobody registered for this meeting' })
      continue
    }

    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com', port: 465, secure: true,
      auth: { user: gmailAddress, pass: gmailAppPassword },
      connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 8000,
    })

    let sentCount = 0
    const failures = []
    for (const r of recipients) {
      const body = template
        .replaceAll('{{greeting}}', greeting)
        .replaceAll('{{parent_name}}', r.parent_name || 'there')
        .replaceAll('{{student_name}}', r.student_name || 'your dancer')
        .replaceAll('{{meeting_details}}', meeting.label || 'tomorrow\'s meeting')
      try {
        await transporter.sendMail({
          from: `"Shine Dance Studio" <${gmailAddress}>`,
          to: r.email,
          replyTo: gmailAddress,
          subject: 'Reminder: Shine parent meeting tomorrow',
          text: body,
        })
        sentCount++
      } catch (e) {
        console.error(`send-meeting-reminders: send failed for ${r.email} —`, e)
        failures.push(r.email)
      }
    }

    // Only mark as sent if it actually went out to at least someone. If
    // EVERY send failed (e.g. a bad Gmail credential that day), leave this
    // unmarked so tomorrow's run — the day-of retry window — gets a real
    // second chance instead of silently giving up.
    if (sentCount > 0) {
      await admin.from('meeting_reminders_sent').insert({ meeting_key: meeting.key, sent_for_date: meeting.date })
    }
    results.push({ meeting: meeting.key, sent: sentCount, failed: failures.length, failures })
  }

  return json(200, { ok: true, today, tomorrow, results })
}

function json(statusCode, payload) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
}
