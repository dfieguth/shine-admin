// Shine — automatic recital reminder (scheduled, runs once a day).
//
// Sends the reminder email to everyone holding CONFIRMED tickets for a
// show, a set number of days before it. Corrie controls all of it from
// Admin > Recital Tickets > Settings & Release:
//   - "Allow recital emails to be sent" must be on (the master switch),
//   - "Send the reminder automatically before each show" must be on,
//   - the number of days before, and
//   - the reminder subject and message.
//
// HOW IT AVOIDS SENDING TWICE: each show has a reminder_sent_at stamp.
// Before sending, this function claims the show by setting that stamp
// only if it is still empty. If two runs ever overlap, only one wins the
// claim and the other skips the show.
//
// IF A DAY IS MISSED (Netlify hiccup, emails were switched off that day):
// the show is picked up on the next run, any day from the target day
// through the day of the show itself. After the show date it is left alone.
//
// IF SENDING FAILS: when every batch for a show fails, the stamp is
// cleared so the next daily run tries again. When only some batches fail,
// the stamp stays (so the families who did get it are not emailed twice)
// and the failure is logged here for Netlify's function log.
//
// Needs the same environment variables as send-meeting-reminders.mjs,
// all already set on this site: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// GMAIL_ADDRESS, GMAIL_APP_PASSWORD.

import { createClient } from '@supabase/supabase-js'
import nodemailer from 'nodemailer'
import { pacificDateString } from './_meeting-reminder-shared.mjs'

const DEFAULT_SUBJECT = 'Reminder: {show_name} is coming up'
const DEFAULT_BODY = "Hi Shine families,\n\nThis is a friendly reminder that you have tickets reserved for {show_name} on {show_date} at {show_time}.\n\nWe can't wait to see you there!\n\nShine Dance Studio"
const BATCH = 80 // Gmail limits recipients per message; BCC in batches

const SAFE_EMAIL = /^[A-Za-z0-9._%+'-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/
const isSafeEmail = (e) => typeof e === 'string' && e.length <= 254 && SAFE_EMAIL.test(e)

// 'YYYY-MM-DD' minus N days, as 'YYYY-MM-DD'. Pure calendar math in UTC,
// so no timezone can shift it by a day.
export function dateMinusDays(dateStr, days) {
  const [y, m, d] = String(dateStr).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d - days)).toISOString().slice(0, 10)
}
// Should this show's reminder go out today? From the target day through
// the day of the show, never after.
export function isDue(showDate, daysBefore, today) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(showDate || ''))) return false
  return dateMinusDays(showDate, daysBefore) <= today && today <= showDate
}
export function fillShow(text, show) {
  const date = show?.show_date
    ? new Date(show.show_date + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })
    : 'the scheduled date'
  return String(text || '')
    .replaceAll('{show_name}', show?.name || 'the recital')
    .replaceAll('{show_date}', date)
    .replaceAll('{show_time}', show?.show_time || 'the scheduled time')
}

export const handler = async () => {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const gmailAddress = process.env.GMAIL_ADDRESS
  const gmailAppPassword = process.env.GMAIL_APP_PASSWORD
  if (!supabaseUrl || !serviceRoleKey || !gmailAddress || !gmailAppPassword) {
    console.error('send-recital-reminders: missing VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GMAIL_ADDRESS or GMAIL_APP_PASSWORD')
    return json(500, { ok: false, error: 'Not configured' })
  }

  const admin = createClient(supabaseUrl, serviceRoleKey)
  const { data: settings, error: setErr } = await admin.from('recital_settings').select('*').eq('id', 1).maybeSingle()
  if (setErr) { console.error('send-recital-reminders: could not read settings —', setErr); return json(500, { ok: false, error: 'Could not read settings' }) }
  if (!settings?.emails_enabled || !settings?.auto_reminder_enabled) {
    return json(200, { ok: true, sent: 0, note: 'Automatic reminder or recital emails are switched off' })
  }
  const days = Math.min(30, Math.max(1, Number(settings.auto_reminder_days) || 2))
  const today = pacificDateString(0)

  const { data: shows, error: showErr } = await admin.from('recital_shows').select('*').eq('active', true).is('reminder_sent_at', null)
  if (showErr) { console.error('send-recital-reminders: could not read shows —', showErr); return json(500, { ok: false, error: 'Could not read shows' }) }
  const due = (shows || []).filter((s) => isDue(s.show_date, days, today))
  if (!due.length) return json(200, { ok: true, sent: 0, note: 'No show is due a reminder today' })

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com', port: 465, secure: true,
    auth: { user: gmailAddress, pass: gmailAppPassword },
    connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 8000,
  })

  const results = []
  for (const show of due) {
    const { data: res, error: resErr } = await admin.from('ticket_reservations').select('email').eq('show_id', show.id).eq('status', 'confirmed')
    if (resErr) { console.error(`send-recital-reminders: could not read reservations for "${show.name}" —`, resErr); results.push({ show: show.name, error: 'could not read reservations' }); continue }
    const emails = [...new Set((res || []).map((r) => String(r.email || '').trim().toLowerCase()).filter(isSafeEmail))]
    // Nobody to email yet. Not stamped, so a family who reserves tomorrow
    // still gets it on the next run.
    if (!emails.length) { results.push({ show: show.name, sent: 0, note: 'no confirmed ticket holders yet' }); continue }

    // Claim the show. Only succeeds if no other run has stamped it.
    const { data: claimed, error: claimErr } = await admin.from('recital_shows')
      .update({ reminder_sent_at: new Date().toISOString() }).eq('id', show.id).is('reminder_sent_at', null).select('id')
    if (claimErr) { console.error(`send-recital-reminders: could not claim "${show.name}" —`, claimErr); results.push({ show: show.name, error: 'could not claim' }); continue }
    if (!claimed?.length) { results.push({ show: show.name, sent: 0, note: 'already handled by another run' }); continue }

    const subject = fillShow(settings.reminder_subject || DEFAULT_SUBJECT, show).replace(/[\r\n]+/g, ' ').slice(0, 200)
    const message = fillShow(settings.reminder_body || DEFAULT_BODY, show)
    let sent = 0
    const failures = []
    for (let i = 0; i < emails.length; i += BATCH) {
      const batch = emails.slice(i, i + BATCH)
      try {
        await transporter.sendMail({
          from: `"Shine Dance Studio" <${gmailAddress}>`,
          to: gmailAddress, // a message with no "to" is more likely to be flagged as spam
          bcc: batch,       // families never see each other's addresses
          replyTo: gmailAddress,
          subject,
          text: message,
          html: `<div style="font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#222">
            ${escapeHtml(message).replace(/\n/g, '<br>')}
            <hr style="border:none;border-top:1px solid #ddd;margin:22px 0">
            <p style="font-size:13px;color:#666;margin:0">Shine Dance Studio &middot; a ministry of Granada Heights Friends Church</p>
          </div>`,
        })
        sent += batch.length
      } catch (e) {
        console.error(`send-recital-reminders: a batch of ${batch.length} failed for "${show.name}" —`, e)
        failures.push(String(e?.message || e))
      }
    }
    if (sent === 0) {
      // Nothing went out at all: release the claim so tomorrow's run retries.
      const { error: undoErr } = await admin.from('recital_shows').update({ reminder_sent_at: null }).eq('id', show.id)
      if (undoErr) console.error(`send-recital-reminders: every send failed for "${show.name}" AND the retry could not be set up —`, undoErr)
    }
    results.push({ show: show.name, sent, of: emails.length, failures: failures.length })
  }
  const anyFailed = results.some((r) => r.error || r.failures)
  if (anyFailed) console.error('send-recital-reminders: finished with problems —', JSON.stringify(results))
  return json(anyFailed ? 500 : 200, { ok: !anyFailed, results })
}

function json(statusCode, payload) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
}
function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
