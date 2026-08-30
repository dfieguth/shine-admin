// Shine — reset a staff login's password directly, no email link involved.
//
// WHY THIS EXISTS: Supabase's email-based password reset failed in
// practice. The reset email arrived, and the link was dead about two
// minutes later — far too fast for a normal expiration. The most likely
// cause is Gmail's own background link-scanning "visiting" the link to
// check for malware before the real person ever clicked it, which burns
// a single-use reset token before it's actually used. This function
// sidesteps that entire failure mode: no link, no token, no race against
// an email scanner. An already-signed-in admin sets the new password
// directly, and it takes effect immediately.
//
// THIS USES THE SERVICE ROLE KEY — full, unrestricted access to the whole
// database, bypassing every RLS policy. That's required here because
// changing another user's password is an admin-only operation the normal
// anon key can't do at all. This key must NEVER be prefixed with VITE_
// (which would bundle it into client-side code and expose it to every
// visitor) and must NEVER be set on shine-public — only on shine-admin's
// Netlify site, as a plain server-side environment variable.
//
// Environment variables needed on the shine-admin Netlify site:
//   VITE_SUPABASE_URL             already set, same as everywhere else
//   VITE_SUPABASE_ANON_KEY        already set, same as everywhere else
//   SUPABASE_SERVICE_ROLE_KEY     NEW — Supabase → Project Settings → API
//                                 → service_role secret. Treat this like a
//                                 master password. Never share it, never
//                                 put it in a repo, never prefix it VITE_.

import { createClient } from '@supabase/supabase-js'

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { ok: false, error: 'Method not allowed' })
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    console.error('reset-staff-password: missing required env vars')
    return json(500, { ok: false, error: 'Not configured — missing Supabase credentials on the server' })
  }

  // Step 1: confirm the caller is actually signed in, same pattern as
  // send-broadcast.mjs. Fails closed on any problem verifying this —
  // missing config here is a hard stop, not a silent bypass.
  const authHeader = event.headers.authorization || event.headers.Authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!token) return json(401, { ok: false, error: 'Not signed in' })

  let callerId
  try {
    const check = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${token}` },
    })
    if (!check.ok) return json(401, { ok: false, error: 'Sign-in expired, refresh and try again' })
    const callerData = await check.json()
    callerId = callerData.id
  } catch (e) {
    console.error('reset-staff-password: could not verify caller —', e)
    return json(500, { ok: false, error: 'Could not verify sign-in' })
  }

  const admin = createClient(supabaseUrl, serviceRoleKey)

  // Step 2: confirm the caller is an admin, not a restricted teacher login.
  // Mirrors the exact same "role !== 'teacher' means admin" rule the rest
  // of the app already uses (including its own fail-closed fix) — a
  // teacher account resetting ANY password, including their own through
  // this tool, is not what this is for.
  const { data: callerRole, error: roleErr } = await admin.from('staff_roles').select('role').eq('user_id', callerId).maybeSingle()
  if (roleErr) {
    console.error('reset-staff-password: could not check caller role —', roleErr)
    return json(500, { ok: false, error: 'Could not verify permissions' })
  }
  if (callerRole?.role === 'teacher') {
    return json(403, { ok: false, error: 'Only admins can reset passwords' })
  }

  let body
  try {
    body = JSON.parse(event.body || '{}')
  } catch {
    return json(400, { ok: false, error: 'Bad request body' })
  }
  const targetUserId = str(body.user_id)
  const newPassword = str(body.new_password)
  if (!targetUserId || !newPassword) {
    return json(400, { ok: false, error: 'Missing user_id or new_password' })
  }
  if (newPassword.length < 8) {
    return json(400, { ok: false, error: 'Password must be at least 8 characters' })
  }

  const { error: updateErr } = await admin.auth.admin.updateUserById(targetUserId, { password: newPassword })
  if (updateErr) {
    console.error('reset-staff-password: update failed for', targetUserId, '—', updateErr)
    return json(500, { ok: false, error: updateErr.message })
  }

  return json(200, { ok: true })
}

function str(v) {
  return v === null || v === undefined ? '' : String(v).trim()
}

function json(statusCode, payload) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }
}
