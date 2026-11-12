// Shine — delete a staff login completely (admin only).
//
// WHY THIS EXISTS: in this app, a login with no row in staff_roles is a
// full admin. The Teacher Access screen's "Remove" button used to delete
// only that row. The person's email and password kept working, and with
// the row gone they were no longer limited, so "removing" a teacher
// quietly turned them into a full admin.
//
// This deletes the login itself, so Remove means what it says: that
// person can no longer sign in at all.
//
// Guard rails:
//   - Caller must be signed in, and must not be a teacher.
//   - Only a login that is listed on the Teacher Access screen (has a
//     staff_roles row) can be deleted, so this cannot be pointed at an
//     arbitrary account.
//   - Nobody can delete their own login (no locking yourself out).
//   - The LOGIN is deleted first, and the row only after that succeeds.
//     Deleting the row first and failing on the login would recreate the
//     exact problem this fixes.
//
// Uses SUPABASE_SERVICE_ROLE_KEY, which is already set on this Netlify
// site for the password reset tool. It never reaches the browser.

import { createClient } from '@supabase/supabase-js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'Method not allowed' })

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    console.error('delete-staff-login: missing VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY')
    return json(500, { ok: false, error: 'Not configured' })
  }

  const authHeader = event.headers.authorization || event.headers.Authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!token) return json(401, { ok: false, error: 'Not signed in' })

  let callerId
  try {
    const check = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${token}` } })
    if (!check.ok) return json(401, { ok: false, error: 'Sign-in expired, refresh and try again' })
    callerId = (await check.json())?.id
  } catch (e) {
    console.error('delete-staff-login: could not verify the caller —', e)
    return json(500, { ok: false, error: 'Could not verify your sign-in' })
  }
  if (!callerId) return json(401, { ok: false, error: 'Not signed in' })

  const admin = createClient(supabaseUrl, serviceRoleKey)

  // Fail closed: if the role lookup itself errors, nobody is treated as an admin.
  const { data: callerRole, error: roleErr } = await admin.from('staff_roles').select('role').eq('user_id', callerId).maybeSingle()
  if (roleErr) {
    console.error('delete-staff-login: could not look up the caller role —', roleErr)
    return json(500, { ok: false, error: 'Could not check your permissions' })
  }
  if (callerRole?.role === 'teacher') return json(403, { ok: false, error: 'Only admins can remove logins' })

  let targetId
  try { targetId = JSON.parse(event.body || '{}').user_id } catch { return json(400, { ok: false, error: 'Bad request body' }) }
  if (typeof targetId !== 'string' || !UUID.test(targetId)) return json(400, { ok: false, error: 'Bad user id' })
  if (targetId === callerId) return json(400, { ok: false, error: 'You cannot remove your own login' })

  const { data: targetRow, error: targetErr } = await admin.from('staff_roles').select('user_id').eq('user_id', targetId).maybeSingle()
  if (targetErr) {
    console.error('delete-staff-login: could not look up the target —', targetErr)
    return json(500, { ok: false, error: 'Could not look up that login' })
  }
  if (!targetRow) return json(404, { ok: false, error: 'That login is not on the Teacher Access list' })

  const { error: delErr } = await admin.auth.admin.deleteUser(targetId)
  // "User not found" means the login is already gone, which is the goal.
  if (delErr && delErr.status !== 404 && !/not.?found/i.test(delErr.message || '')) {
    console.error('delete-staff-login: deleting the login failed —', delErr)
    const why = delErr.message && delErr.message !== '{}' ? delErr.message : 'Supabase returned an error'
    return json(500, { ok: false, error: `Could not delete the login: ${why}` })
  }

  // The database removes the row with the login. This covers the case
  // where the login was already gone and only the row was left behind.
  const { error: rowErr } = await admin.from('staff_roles').delete().eq('user_id', targetId)
  if (rowErr) console.error('delete-staff-login: login deleted, but the leftover row could not be removed —', rowErr)

  return json(200, { ok: true })
}

function json(statusCode, payload) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
}
