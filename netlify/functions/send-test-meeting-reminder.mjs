// Shine — test/preview a parent meeting reminder without touching any
// real parent or the real "already sent" tracking.
//
// This exists to answer two questions safely, before anything real is at
// stake: "does this pull the right information?" and "can I actually
// receive one myself to check it looks right?"
//
// Uses the SAME shared rendering logic as the real scheduled function
// (_meeting-reminder-shared.mjs) — this is what makes a passing test
// mean something. It reads the REAL, currently-saved Site Content (the
// actual label and template Corrie has saved, not fake sample text), but
// always sends to only the address the admin types in, and never reads
// from or writes to the real registrations list or the
// meeting_reminders_sent tracking table.

import { createClient } from '@supabase/supabase-js'
import nodemailer from 'nodemailer'
import { currentGreeting, renderReminder, REMINDER_SUBJECT } from './_meeting-reminder-shared.mjs'

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'Method not allowed' })

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const gmailAddress = process.env.GMAIL_ADDRESS
  const gmailAppPassword = process.env.GMAIL_APP_PASSWORD

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return json(500, { ok: false, error: 'Not configured' })
  }

  // Same admin-only check as reset-staff-password.mjs — a test send tool
  // is still a real email-sending tool, no reason it should be any less
  // protected than the others.
  const authHeader = event.headers.authorization || event.headers.Authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!token) return json(401, { ok: false, error: 'Not signed in' })
  let callerId
  try {
    const check = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${token}` } })
    if (!check.ok) return json(401, { ok: false, error: 'Sign-in expired, refresh and try again' })
    callerId = (await check.json()).id
  } catch (e) {
    return json(500, { ok: false, error: 'Could not verify sign-in' })
  }
  const admin = createClient(supabaseUrl, serviceRoleKey)
  const { data: callerRole } = await admin.from('staff_roles').select('role').eq('user_id', callerId).maybeSingle()
  if (callerRole?.role === 'teacher') return json(403, { ok: false, error: 'Only admins can send test reminders' })

  let body
  try { body = JSON.parse(event.body || '{}') } catch { return json(400, { ok: false, error: 'Bad request body' }) }
  const meetingKey = body.meeting_key === 'sep3' ? 'sep3' : 'aug28'
  const testEmail = str(body.test_email)
  const sendIt = !!body.send // false/missing = preview only, no email sent
  if (sendIt && !testEmail) return json(400, { ok: false, error: 'Need an email address to actually send a test' })

  const { data: scRows, error: scErr } = await admin.from('site_content').select('key, value').in('key', [
    'meeting_aug28_label', 'meeting_sep3_label', 'parent_meeting_reminder_template',
  ])
  if (scErr) return json(500, { ok: false, error: scErr.message })
  const sc = {}
  for (const row of scRows || []) sc[row.key] = row.value

  const label = meetingKey === 'aug28' ? sc.meeting_aug28_label : sc.meeting_sep3_label
  if (!label) {
    return json(400, { ok: false, error: `This meeting's date/time label isn't set in Site Content yet — set that first so there's something real to test.` })
  }

  // Realistic-but-obviously-fake sample data, since there's no real
  // registration behind a test. This is exactly what proves point #1
  // (does it pull the right information) — the response below shows the
  // REAL label and REAL template, substituted exactly like a real send,
  // so what you see is genuinely what a real parent's version would look
  // like with their real name in place of these placeholders.
  const rendered = renderReminder(sc.parent_meeting_reminder_template, {
    greeting: currentGreeting(),
    parentName: 'Test Parent',
    studentName: 'Test Student',
    meetingDetails: label,
  })

  if (!sendIt) {
    return json(200, { ok: true, preview: true, subject: REMINDER_SUBJECT, body: rendered })
  }

  if (!gmailAddress || !gmailAppPassword) {
    return json(500, { ok: false, error: 'Email not configured' })
  }
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com', port: 465, secure: true,
    auth: { user: gmailAddress, pass: gmailAppPassword },
    connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 8000,
  })
  try {
    await transporter.sendMail({
      from: `"Shine Dance Studio" <${gmailAddress}>`,
      to: testEmail,
      replyTo: gmailAddress,
      subject: `[TEST] ${REMINDER_SUBJECT}`,
      text: `This is a TEST send — a real parent would not see this line.\n\n${rendered}`,
    })
  } catch (e) {
    console.error('send-test-meeting-reminder: send failed —', e)
    return json(500, { ok: false, error: String(e?.message || e) })
  }

  return json(200, { ok: true, sent: true, to: testEmail, subject: REMINDER_SUBJECT, body: rendered })
}

function str(v) {
  return v === null || v === undefined ? '' : String(v).trim()
}
function json(statusCode, payload) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
}
