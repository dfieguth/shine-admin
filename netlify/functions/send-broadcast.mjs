// Shine — "Send from Shine" broadcast email.
//
// WHY THIS LIVES HERE AND NOT IN SUPABASE:
// Supabase Edge Functions block outbound SMTP ports (25/465/587) at the
// platform level. The old edge function version of this could never work —
// it would boot, hang trying to reach smtp.gmail.com, and get killed with
// no error message ("EarlyDrop" in the logs). Netlify does not block those
// ports, so the exact same Gmail app password works fine from here.
//
// Environment variables needed on the shine-admin Netlify site:
//   GMAIL_ADDRESS        shineGHFC@gmail.com
//   GMAIL_APP_PASSWORD   the 16-character app password, NO SPACES
// Plus the two that already exist for the site build, reused here to
// verify the caller is a real signed-in staff member:
//   VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY

import nodemailer from 'nodemailer'

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { ok: false, error: 'Method not allowed' })
  }

  const gmailAddress = process.env.GMAIL_ADDRESS
  const gmailAppPassword = process.env.GMAIL_APP_PASSWORD
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

  if (!gmailAddress || !gmailAppPassword) {
    return json(500, { ok: false, error: 'Email not configured (missing GMAIL_ADDRESS or GMAIL_APP_PASSWORD)' })
  }

  // --- Confirm this came from a real signed-in staff member -------------
  // Netlify functions are public URLs by default. Without this check,
  // anyone could POST here and use the church's Gmail account to send
  // email to any address they wanted. This replaces the "Verify JWT ON"
  // setting the old Supabase edge function relied on.
  const authHeader = event.headers.authorization || event.headers.Authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!token) return json(401, { ok: false, error: 'Not signed in' })

  // THE FIX (restored — this had regressed back to the original bug): this
  // must NOT only run when supabaseUrl/supabaseAnonKey are both present.
  // If either was missing, the whole verification block used to be skipped
  // entirely, and ANY non-empty Bearer token would pass — meaning anyone
  // who found this URL could use the church's Gmail with zero valid
  // credentials. Missing config now fails closed, matching the Gmail-
  // config check above, instead of silently granting access.
  if (!supabaseUrl || !supabaseAnonKey) {
    return json(500, { ok: false, error: 'Auth verification not configured (missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY)' })
  }
  let callerId
  try {
    const check = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${token}` },
    })
    if (!check.ok) return json(401, { ok: false, error: 'Sign-in expired, refresh and try again' })
    callerId = (await check.json()).id
  } catch (e) {
    console.error('send-broadcast: could not verify sign-in —', e)
    return json(500, { ok: false, error: 'Could not verify sign-in' })
  }

  // Being signed in is not the same as being allowed to mass-email.
  // Restricted teacher logins only ever see Attendance in the app, but
  // this is a public URL — a teacher's own valid token would have passed
  // the check above and sent email to any address they wanted, through
  // the church's Gmail account. reset-staff-password and
  // send-test-meeting-reminder already reject teachers; this one didn't.
  //
  // Read with the caller's own token (not a service key) — staff_roles is
  // readable by any signed-in staff member, so no extra credential is
  // needed here. Fails CLOSED: if the role can't be read, the send is
  // refused rather than allowed through.
  try {
    const roleRes = await fetch(`${supabaseUrl}/rest/v1/staff_roles?select=role&user_id=eq.${callerId}`, {
      headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${token}` },
    })
    if (!roleRes.ok) {
      console.error('send-broadcast: could not read caller role, refusing to send —', roleRes.status)
      return json(500, { ok: false, error: 'Could not verify permissions' })
    }
    const roleRows = await roleRes.json()
    // No row at all means a full-access account — that's the app's
    // existing rule, kept identical here so behavior doesn't change for
    // Corrie or any other admin login.
    if (Array.isArray(roleRows) && roleRows[0]?.role === 'teacher') {
      return json(403, { ok: false, error: 'Only admins can send email from Shine' })
    }
  } catch (e) {
    console.error('send-broadcast: role check failed, refusing to send —', e)
    return json(500, { ok: false, error: 'Could not verify permissions' })
  }

  // --- Read the message -------------------------------------------------
  let body
  try {
    body = JSON.parse(event.body || '{}')
  } catch {
    return json(400, { ok: false, error: 'Bad request body' })
  }

  const subject = (body.subject || '').trim()
  const message = (body.message || '').trim()
  const emails = Array.isArray(body.emails)
    ? [...new Set(body.emails.map((e) => String(e || '').trim()).filter(Boolean))]
    : []

  if (!subject) return json(400, { ok: false, error: 'Subject is required' })
  if (!message) return json(400, { ok: false, error: 'Message is required' })
  if (!emails.length) return json(400, { ok: false, error: 'No recipient emails' })

  // --- Send -------------------------------------------------------------
  // Everyone goes in BCC so families never see each other's addresses.
  // The "to" is the Shine account itself — a message with no "to" at all
  // is much more likely to get flagged as spam.
  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: gmailAddress, pass: gmailAppPassword },
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 8000,
    })

    await transporter.sendMail({
      from: `"Shine Dance Studio" <${gmailAddress}>`,
      to: gmailAddress,
      bcc: emails,
      replyTo: gmailAddress,
      subject,
      text: message,
      html: `<div style="font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#222">
        ${escapeHtml(message).replace(/\n/g, '<br>')}
        <hr style="border:none;border-top:1px solid #ddd;margin:22px 0">
        <p style="font-size:13px;color:#666;margin:0">Shine Dance Studio &middot; a ministry of Granada Heights Friends Church</p>
      </div>`,
    })

    return json(200, { ok: true, sent: emails.length })
  } catch (e) {
    console.error('send-broadcast: send failed —', e)
    return json(500, { ok: false, error: String(e && e.message ? e.message : e) })
  }
}

function json(statusCode, payload) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
