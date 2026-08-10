import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabaseClient'

/* ============================================================
   Shine Dance Studio — internal management tool
   One file on purpose: easy to read top to bottom and hand off.
   ============================================================ */

// Sends a BCC email from the Shine Gmail account.
//
// This calls a Netlify Function, NOT a Supabase Edge Function. Supabase's
// edge runtime blocks outbound SMTP ports (25/465/587) at the platform
// level, so Gmail sending could never work from there — the function would
// hang and get killed with no error. Netlify does not block those ports.
//
// The logged-in user's Supabase access token is passed along so the
// function can confirm the request came from a real staff login before it
// sends anything (this replaces the "Verify JWT" setting the old edge
// function had, which Netlify functions don't do automatically).
async function sendFromShine({ subject, message, emails }) {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) return { ok: false, error: 'Not signed in' }
    const res = await fetch('/.netlify/functions/send-broadcast', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ subject, message, emails }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || data?.ok === false) return { ok: false, error: data?.error || `HTTP ${res.status}` }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: String(e?.message || e) }
  }
}

function Modal({ title, onClose, children, onSave, saving, saveLabel = 'Save' }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><h2>{title}</h2></div>
        <div className="modal-body">{children}</div>
        <div className="modal-foot">
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn" onClick={onSave} disabled={saving}>{saving ? 'Saving…' : saveLabel}</button>
        </div>
      </div>
    </div>
  )
}

// Click-to-sort table headers, reused across every list screen. Click once
// for ascending, click the same column again to flip to descending.
function useSort(initialKey, initialDir = 'asc') {
  const [key, setKey] = useState(initialKey)
  const [dir, setDir] = useState(initialDir)
  function requestSort(k) {
    if (k === key) setDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setKey(k); setDir('asc') }
  }
  return { key, dir, requestSort }
}
function SortTh({ label, sortKey, sort }) {
  const active = sort.key === sortKey
  return (
    <th onClick={() => sort.requestSort(sortKey)} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }} title="Click to sort">
      {label}<span style={{ color: active ? 'var(--brass)' : 'var(--line)', marginLeft: 4 }}>{active ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
    </th>
  )
}
// getters: { columnKey: (row) => sortableValue }. Rows with no getter for
// the current key pass through unsorted (safe no-op).
function applySort(rows, sort, getters) {
  const get = getters[sort.key]
  if (!get) return rows
  return [...rows].sort((a, b) => {
    const av = get(a); const bv = get(b)
    const an = av === null || av === undefined
    const bn = bv === null || bv === undefined
    if (an && bn) return 0
    if (an) return 1 // blanks sort last regardless of direction
    if (bn) return -1
    const cmp = (typeof av === 'number' && typeof bv === 'number') ? av - bv : String(av).localeCompare(String(bv))
    return sort.dir === 'asc' ? cmp : -cmp
  })
}

function Field({ label, ...props }) {
  return (
    <div className="field">
      <label>{label}</label>
      {props.options
        ? <select {...props}>{props.options.map((o) => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}</select>
        : props.textarea
          ? <textarea {...props} />
          : <input {...props} />}
    </div>
  )
}

function AuthScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  async function signIn() {
    setBusy(true); setErr('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setErr(error.message)
    setBusy(false)
  }
  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="brand">Shine<small>Dance Studio · Staff</small></div>
        <p className="auth-sub">Sign in to manage classes and rosters.</p>
        {err && <div className="auth-err">{err}</div>}
        <div className="field"><label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && signIn()} /></div>
        <div className="field"><label>Password</label>
          <div style={{ position: 'relative' }}>
            <input
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && signIn()}
              style={{ paddingRight: 56, width: '100%' }}
            />
            <button
              type="button"
              onClick={() => setShowPw((s) => !s)}
              style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--ink-soft)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', padding: '4px 6px' }}
            >
              {showPw ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>
        <button className="btn" onClick={signIn} disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </div>
    </div>
  )
}

function Dashboard({ go }) {
  const [stats, setStats] = useState(null)
  useEffect(() => {
    (async () => {
      const [students, families, classes, regs] = await Promise.all([
        supabase.from('students').select('id', { count: 'exact', head: true }),
        supabase.from('families').select('id', { count: 'exact', head: true }),
        supabase.from('classes').select('id', { count: 'exact', head: true }).eq('active', true),
        supabase.from('registrations').select('id', { count: 'exact', head: true }).eq('processed', false),
      ])
      setStats({ students: students.count ?? 0, families: families.count ?? 0, classes: classes.count ?? 0, newReg: regs.count ?? 0 })
    })()
  }, [])
  if (!stats) return <div className="loading">Loading…</div>
  return (
    <>
      <div className="page-head"><div><h1>Dashboard</h1><p>A quick read on where things stand.</p></div></div>
      <div className="stat-grid">
        <div className="stat"><div className="num">{stats.students}</div><div className="label">Students</div></div>
        <div className="stat"><div className="num">{stats.families}</div><div className="label">Families</div></div>
        <div className="stat"><div className="num">{stats.classes}</div><div className="label">Active classes</div></div>
        <div className="stat accent" style={{ cursor: 'pointer' }} onClick={() => go('registrations')}>
          <div className="num">{stats.newReg}</div><div className="label">New registrations</div></div>
      </div>
      {stats.newReg > 0 && (
        <div className="card card-pad">
          <strong>{stats.newReg} new registration{stats.newReg > 1 ? 's' : ''} waiting.</strong>{' '}
          <button className="btn small" style={{ marginLeft: 8 }} onClick={() => go('registrations')}>Review now</button>
        </div>
      )}
    </>
  )
}

const BLANK_CLASS = { name: '', level: 'Beginner', day_of_week: 'Monday', start_time: '', end_time: '', location: '', capacity: '', instructor_name: '', min_age: '', max_age: '', room_id: '', teacher_id: '', class_mom: '', assistant_name: '', in_recital: false, active: true }
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const LEVELS = ['Beginner', 'Intermediate', 'Advanced', 'All levels']

const CLASS_DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

function Classes({ onOpenRoster }) {
  const [rows, setRows] = useState(null)
  const [teachers, setTeachers] = useState([])
  const [edit, setEdit] = useState(null)
  const [saving, setSaving] = useState(false)
  const [seasonFilter, setSeasonFilter] = useState('')
  const sort = useSort('class')
  const [clsErr, setClsErr] = useState('')
  const [viewingClass, setViewingClass] = useState(null)
  const [rooms, setRooms] = useState([])
  const [enrollCounts, setEnrollCounts] = useState({})
  const [waitlistCounts, setWaitlistCounts] = useState({})
  const load = useCallback(async () => {
    const [c, t, rm, enr] = await Promise.all([
      supabase.from('classes').select('*, rooms(name), teachers(name)').order('season', { ascending: false }).order('active', { ascending: false }).order('day_of_week'),
      supabase.from('teachers').select('id, name').order('name'),
      supabase.from('rooms').select('id, name').order('name'),
      // Admin can read enrollments directly, so counting both enrolled AND
      // waitlisted per class in one pass, no separate DB function needed.
      supabase.from('enrollments').select('class_id, status').in('status', ['enrolled', 'waitlist']),
    ])
    setRows(c.data || []); setTeachers(t.data || []); setRooms(rm.data || [])
    const em = {}, wm = {}
    for (const e of enr.data || []) {
      if (e.status === 'enrolled') em[e.class_id] = (em[e.class_id] || 0) + 1
      else if (e.status === 'waitlist') wm[e.class_id] = (wm[e.class_id] || 0) + 1
    }
    setEnrollCounts(em); setWaitlistCounts(wm)
    if (!seasonFilter && c.data?.length) setSeasonFilter(c.data[0].season || '')
  }, [seasonFilter])
  useEffect(() => { load() }, [load])
  async function save() {
    setSaving(true)
    const payload = {
      ...edit,
      capacity: edit.capacity === '' ? null : Number(edit.capacity),
      min_age: edit.min_age === '' ? null : Number(edit.min_age),
      max_age: edit.max_age === '' ? null : Number(edit.max_age),
      room_id: edit.room_id || null,
      teacher_id: edit.teacher_id || null,
    }
    delete payload.rooms; delete payload.teachers
    const { error } = edit.id
      ? await supabase.from('classes').update(payload).eq('id', edit.id)
      : await supabase.from('classes').insert(payload)
    setSaving(false)
    if (error) { setClsErr(error.message || 'Could not save. Make sure the database is up to date (run the latest SQL).'); return }
    setEdit(null); load()
  }
  async function toggleActive(c) { await supabase.from('classes').update({ active: !c.active }).eq('id', c.id); load() }
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  async function openDeleteConfirm(c) {
    const [{ count: enrollCount }, { data: enrIds }] = await Promise.all([
      supabase.from('enrollments').select('id', { count: 'exact', head: true }).eq('class_id', c.id),
      supabase.from('enrollments').select('id').eq('class_id', c.id),
    ])
    let attendanceCount = 0
    if (enrIds && enrIds.length) {
      const { count } = await supabase.from('attendance').select('id', { count: 'exact', head: true }).in('enrollment_id', enrIds.map((e) => e.id))
      attendanceCount = count || 0
    }
    setConfirmDelete({ ...c, enrollCount: enrollCount || 0, attendanceCount })
  }
  async function doDelete() {
    setDeleting(true)
    await supabase.from('classes').delete().eq('id', confirmDelete.id)
    setDeleting(false); setConfirmDelete(null); setEdit(null); load()
  }
  if (!rows) return <div className="loading">Loading…</div>
  const allSeasons = [...new Set(rows.map((c) => c.season || 'unlabeled'))]
  let visible = seasonFilter ? rows.filter((c) => (c.season || 'unlabeled') === seasonFilter) : rows
  visible = applySort(visible, sort, {
    // Compound sort keys: primary field first, then a zero-padded day index
    // as a tiebreaker, so classes with the same name group together in
    // calendar day order instead of database-insert order. This is the fix
    // for "classes aren't in any particular order" — sorting by Name is now
    // the default view.
    day: (c) => `${String(CLASS_DAY_ORDER.indexOf(c.day_of_week)).padStart(2, '0')}__${(c.name || '').toLowerCase()}`,
    class: (c) => `${(c.name || '').toLowerCase()}__${String(CLASS_DAY_ORDER.indexOf(c.day_of_week)).padStart(2, '0')}`,
    level: (c) => (c.level || '').toLowerCase(),
    room: (c) => (c.rooms?.name || '').toLowerCase(),
    teacher: (c) => (c.teachers?.name || c.instructor_name || '').toLowerCase(),
    status: (c) => c.active ? 0 : 1,
  })
  visible = [...visible].sort((x, y) => (x.active === y.active) ? 0 : (x.active ? -1 : 1))
  return (
    <>
      <div className="page-head">
        <div><h1>Classes</h1><p>Add or edit a class. Retire pauses a class (and can be restored); delete removes it permanently, from the Edit screen.</p></div>
        <button className="btn" onClick={() => { setClsErr(''); setEdit({ ...BLANK_CLASS, season: seasonFilter || undefined }) }}>Add class</button>
      </div>
      {allSeasons.length > 1 && (
        <div className="toolbar">
          <select value={seasonFilter} onChange={(e) => setSeasonFilter(e.target.value)}>
            <option value="">All seasons</option>
            {allSeasons
              .map((s) => ({ label: s, count: rows.filter((c) => (c.season || 'unlabeled') === s).length }))
              .sort((a, b) => b.label.localeCompare(a.label))
              .map(({ label, count }) => <option key={label} value={label}>{label} ({count} class{count !== 1 ? 'es' : ''})</option>)}
          </select>
          <span style={{ color: 'var(--ink-soft)', fontSize: 13 }}>Showing {visible.length} of {rows.length} classes</span>
        </div>
      )}
      <p style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginBottom: 8 }}>Click any column heading below to sort by it.</p>
      {visible.length === 0 ? (
        <div className="card"><div className="empty"><h3>No classes yet</h3><p>Add your first class to start building the schedule.</p><button className="btn" onClick={() => setEdit({ ...BLANK_CLASS })}>Add class</button></div></div>
      ) : (
        <div className="table-wrap"><table>
          <thead><tr><SortTh label="Class" sortKey="class" sort={sort} /><SortTh label="Level" sortKey="level" sort={sort} /><SortTh label="When" sortKey="day" sort={sort} /><SortTh label="Room" sortKey="room" sort={sort} /><SortTh label="Instructor" sortKey="teacher" sort={sort} /><SortTh label="Status" sortKey="status" sort={sort} /><th></th></tr></thead>
          <tbody>
            {visible.map((c) => (
              <tr key={c.id}>
                <td data-label="Class">
                  <button className="link-like" onClick={() => onOpenRoster && onOpenRoster(c.id)}>{c.name}</button>
                  <br /><span style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>
                    {enrollCounts[c.id] || 0}{c.capacity ? `/${c.capacity}` : ''} enrolled
                    {c.capacity && (enrollCounts[c.id] || 0) >= c.capacity && <span className="pill waitlist" style={{ marginLeft: 6 }}>FULL</span>}
                    {(waitlistCounts[c.id] || 0) > 0 && <span style={{ marginLeft: 6, color: 'var(--brass-dark, #a3741f)', fontWeight: 500 }}>· {waitlistCounts[c.id]} waitlisted</span>}
                  </span>
                </td>
                <td data-label="Level">{c.level}{(c.min_age || c.max_age) && <><br /><span style={{ color: 'var(--ink-soft)', fontSize: 12.5 }}>Ages {c.min_age || '0'}{c.max_age ? `–${c.max_age}` : '+'}</span></>}</td>
                <td data-label="When">{c.day_of_week}<br /><span style={{ color: 'var(--ink-soft)', fontSize: 13 }}>{c.start_time}{c.end_time ? `–${c.end_time}` : ''}</span></td>
                <td data-label="Room">{c.rooms?.name || '—'}</td>
                <td data-label="Instructor">{c.teachers?.name || c.instructor_name || '—'}</td>
                <td data-label="Status"><span className={`pill ${c.active ? 'enrolled' : 'inactive'}`}>{c.active ? 'Active' : 'Retired'}</span></td>
                <td><div className="row-actions">
                  <button className="btn ghost small" onClick={() => setViewingClass(c)}>View</button>
                  <button className="btn ghost small" onClick={() => setEdit(c)}>Edit</button>
                  <button className="btn ghost small" onClick={() => toggleActive(c)}>{c.active ? 'Retire' : 'Restore'}</button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
      {edit && (
        <Modal title={edit.id ? 'Edit class' : 'Add class'} onClose={() => setEdit(null)} onSave={save} saving={saving}>
          {clsErr && <div className="auth-err" style={{ marginBottom: 4 }}>{clsErr}</div>}
          <Field label="Class name (type anything — add as many classes as you need)" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="e.g. Tuesday Beginner Ballet" />
          <div className="field row2">
            <Field label="Level" value={edit.level} options={LEVELS} onChange={(e) => setEdit({ ...edit, level: e.target.value })} />
            <Field label="Day" value={edit.day_of_week} options={DAYS} onChange={(e) => setEdit({ ...edit, day_of_week: e.target.value })} />
          </div>
          <div className="field row2">
            <Field label="Start time" value={edit.start_time} onChange={(e) => setEdit({ ...edit, start_time: e.target.value })} placeholder="4:00 PM" />
            <Field label="End time" value={edit.end_time} onChange={(e) => setEdit({ ...edit, end_time: e.target.value })} placeholder="5:00 PM" />
          </div>
          <Field label="Location" value={edit.location} onChange={(e) => setEdit({ ...edit, location: e.target.value })} placeholder="Fellowship Hall" />
          <div className="field row2">
            <Field label="Teacher" value={edit.teacher_id || ''} options={[{ value: '', label: '— choose —' }, ...teachers.map((t) => ({ value: t.id, label: t.name }))]} onChange={(e) => setEdit({ ...edit, teacher_id: e.target.value })} />
            <Field label="Room" value={edit.room_id || ''} options={[{ value: '', label: '— choose —' }, ...rooms.map((r) => ({ value: r.id, label: r.name }))]} onChange={(e) => setEdit({ ...edit, room_id: e.target.value })} />
          </div>
          <Field label="Capacity (optional)" type="number" value={edit.capacity ?? ''} onChange={(e) => setEdit({ ...edit, capacity: e.target.value })} />
          <div className="field row2">
            <Field label="Min age (optional)" type="number" value={edit.min_age ?? ''} onChange={(e) => setEdit({ ...edit, min_age: e.target.value })} placeholder="e.g. 7" />
            <Field label="Max age (optional)" type="number" value={edit.max_age ?? ''} onChange={(e) => setEdit({ ...edit, max_age: e.target.value })} placeholder="e.g. 9, blank = no max" />
          </div>
          <div className="field row2">
            <Field label="Class Mom" value={edit.class_mom || ''} onChange={(e) => setEdit({ ...edit, class_mom: e.target.value })} placeholder="Parent helper for this class" />
            <Field label="Assistant" value={edit.assistant_name || ''} onChange={(e) => setEdit({ ...edit, assistant_name: e.target.value })} placeholder="Teaching assistant" />
          </div>
          <label className="check" style={{ marginTop: 4 }}>
            <input type="checkbox" checked={!!edit.in_recital} onChange={(e) => setEdit({ ...edit, in_recital: e.target.checked })} />
            <span>This class will be in the recital</span>
          </label>
          {edit.id && (
            <div style={{ marginTop: 6, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
              <button className="btn danger small" onClick={() => openDeleteConfirm(edit)}>Delete this class permanently</button>
              <p style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 6 }}>
                For a class pausing between seasons, use <strong>Retire</strong> instead (in the class list) — it can be restored later. Delete is only for classes that are truly done and won't come back.
              </p>
            </div>
          )}
        </Modal>
      )}
      {viewingClass && (
        <div className="overlay" onClick={() => setViewingClass(null)}>
          <div className="modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head"><h2>{viewingClass.name}</h2></div>
            <div className="modal-body view-profile">
              <div className="vp-row"><span>Level</span><span>{viewingClass.level || '—'}</span></div>
              <div className="vp-row"><span>When</span><span>{viewingClass.day_of_week} {viewingClass.start_time}{viewingClass.end_time ? `–${viewingClass.end_time}` : ''}</span></div>
              <div className="vp-row"><span>Ages</span><span>{(viewingClass.min_age || viewingClass.max_age) ? `${viewingClass.min_age || 0}${viewingClass.max_age ? `–${viewingClass.max_age}` : '+'}` : '—'}</span></div>
              <div className="vp-row"><span>Room</span><span>{viewingClass.rooms?.name || '—'}</span></div>
              <div className="vp-row"><span>Teacher</span><span>{viewingClass.teachers?.name || viewingClass.instructor_name || '—'}</span></div>
              <div className="vp-row"><span>Assistant</span><span>{viewingClass.assistant_name || '—'}</span></div>
              <div className="vp-row"><span>Class Mom</span><span>{viewingClass.class_mom || '—'}</span></div>
              <div className="vp-row"><span>Capacity</span><span>{viewingClass.capacity || 'No limit'}</span></div>
              <div className="vp-row"><span>Season</span><span>{viewingClass.season || '—'}</span></div>
              <div className="vp-row"><span>In recital</span><span>{viewingClass.in_recital ? 'Yes' : 'No'}</span></div>
              <div className="vp-row"><span>Status</span><span>{viewingClass.active ? 'Active' : 'Retired'}</span></div>
            </div>
            <div className="modal-foot">
              <button className="btn ghost" onClick={() => setViewingClass(null)}>Close</button>
              <button className="btn" onClick={() => { const c = viewingClass; setViewingClass(null); setEdit(c) }}>Edit this class</button>
            </div>
          </div>
        </div>
      )}
      {confirmDelete && (
        <div className="overlay" onClick={() => setConfirmDelete(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head"><h2>Delete "{confirmDelete.name}"?</h2></div>
            <div className="modal-body">
              <p style={{ fontSize: 14.5 }}>This permanently deletes the class and cannot be undone. It will also permanently erase:</p>
              <ul style={{ margin: '10px 0 10px 20px', fontSize: 14.5 }}>
                <li><strong>{confirmDelete.enrollCount}</strong> enrollment record{confirmDelete.enrollCount !== 1 ? 's' : ''} (current and past students in this class)</li>
                <li><strong>{confirmDelete.attendanceCount}</strong> attendance record{confirmDelete.attendanceCount !== 1 ? 's' : ''} taken for this class</li>
              </ul>
              <p style={{ fontSize: 13.5, color: 'var(--ink-soft)' }}>
                If this class might come back next season, click Cancel and use <strong>Retire</strong> instead — that keeps all of this history safe.
              </p>
            </div>
            <div className="modal-foot">
              <button className="btn ghost" onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button className="btn danger" onClick={doDelete} disabled={deleting} style={{ background: 'var(--danger)', color: '#fff', border: 'none' }}>
                {deleting ? 'Deleting…' : 'Yes, permanently delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

const BLANK_FAMILY = { parent_first_name: '', parent_last_name: '', email: '', phone: '', emergency_contact_name: '', emergency_contact_phone: '', notes: '' }
function Families() {
  const [rows, setRows] = useState(null)
  const [studentCounts, setStudentCounts] = useState({}) // family_id -> [student names]
  const [edit, setEdit] = useState(null)
  const [saving, setSaving] = useState(false)
  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState('active') // active | archived | all
  const [showDupes, setShowDupes] = useState(false)
  const [merging, setMerging] = useState(null) // { groupKey, survivorId }
  const [mergeBusy, setMergeBusy] = useState(false)
  const sort = useSort('parent')

  const load = useCallback(async () => {
    const [{ data: fams }, { data: studs }] = await Promise.all([
      supabase.from('families').select('*').order('parent_last_name'),
      supabase.from('students').select('id, first_name, last_name, family_id'),
    ])
    setRows(fams || [])
    const map = {}
    for (const s of studs || []) {
      if (!s.family_id) continue
      ;(map[s.family_id] = map[s.family_id] || []).push(`${s.first_name} ${s.last_name}`)
    }
    setStudentCounts(map)
  }, [])
  useEffect(() => { load() }, [load])

  async function save() {
    setSaving(true)
    if (edit.id) await supabase.from('families').update(edit).eq('id', edit.id)
    else await supabase.from('families').insert(edit)
    setSaving(false); setEdit(null); load()
  }
  async function toggleArchived(f) {
    await supabase.from('families').update({ archived: !f.archived }).eq('id', f.id)
    load()
  }

  // Possible-duplicate detection: same normalized parent name appearing on
  // more than one non-archived family record. Client-side, same logic as
  // the SQL diagnostic from before — just built into the screen now.
  const dupeGroups = (() => {
    if (!rows) return []
    const groups = {}
    for (const f of rows.filter((f) => !f.archived)) {
      const key = `${(f.parent_first_name || '').trim().toLowerCase()} ${(f.parent_last_name || '').trim().toLowerCase()}`
      if (!key.trim()) continue
      ;(groups[key] = groups[key] || []).push(f)
    }
    return Object.values(groups).filter((g) => g.length > 1)
  })()

  async function runMerge(group, survivorId) {
    setMergeBusy(true)
    const others = group.filter((f) => f.id !== survivorId)
    for (const loser of others) {
      // Move every student off the record being retired onto the survivor —
      // this is what preserves their enrollment/attendance history instead
      // of losing it, which is the whole reason this isn't just a delete.
      await supabase.from('students').update({ family_id: survivorId }).eq('family_id', loser.id)
      await supabase.from('families').update({ archived: true }).eq('id', loser.id)
    }
    setMergeBusy(false); setMerging(null); load()
  }

  // Bulk shortcut: run every group's merge at once, always keeping whichever
  // record in that group has the most recent created_at. This is exactly
  // "keep today's registration" in practice, since a fresh registration is
  // always the newest record — but it's phrased as "newest," not "today,"
  // so it stays correct even if this gets run on a different day.
  const [bulkPreview, setBulkPreview] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)
  async function runBulkMergeAll() {
    setBulkBusy(true)
    for (const group of dupeGroups) {
      const survivor = group.slice().sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))[0]
      const others = group.filter((f) => f.id !== survivor.id)
      for (const loser of others) {
        await supabase.from('students').update({ family_id: survivor.id }).eq('family_id', loser.id)
        await supabase.from('families').update({ archived: true }).eq('id', loser.id)
      }
    }
    setBulkBusy(false); setBulkPreview(false); load()
  }

  if (!rows) return <div className="loading">Loading…</div>
  const filtered = applySort(
    rows
      .filter((f) => statusFilter === 'all' ? true : statusFilter === 'archived' ? f.archived : !f.archived)
      .filter((f) => `${f.parent_first_name} ${f.parent_last_name} ${f.email}`.toLowerCase().includes(q.toLowerCase())),
    sort,
    {
      parent: (f) => `${f.parent_last_name} ${f.parent_first_name}`.toLowerCase(),
      contact: (f) => (f.email || f.phone || '').toLowerCase(),
      emergency: (f) => (f.emergency_contact_name || '').toLowerCase(),
      created: (f) => f.created_at || '',
    }
  )
  return (
    <>
      <div className="page-head">
        <div><h1>Families</h1><p>Parent contacts and emergency info.</p></div>
        <button className="btn" onClick={() => setEdit({ ...BLANK_FAMILY })}>Add family</button>
      </div>

      {dupeGroups.length > 0 && (
        <div className="card" style={{ marginBottom: 18, borderColor: '#e8cf9f', background: '#fdf9f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <strong style={{ fontSize: 14.5 }}>{dupeGroups.length} possible duplicate famil{dupeGroups.length > 1 ? 'ies' : 'y'} found</strong>
              <span style={{ color: 'var(--ink-soft)', fontSize: 13, marginLeft: 6 }}>— same parent name appears more than once</span>
            </div>
            <button className="btn ghost small" onClick={() => setShowDupes((s) => !s)}>{showDupes ? 'Hide' : 'Review'}</button>
            <button className="btn small" onClick={() => setBulkPreview(true)}>Keep newest in every group</button>
          </div>
          {showDupes && (
            <div style={{ marginTop: 16 }}>
              {dupeGroups.map((group, gi) => (
                <div key={gi} className="card" style={{ marginBottom: 12, background: '#fff' }}>
                  <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 10 }}>
                    Pick which record to KEEP. Every student on the others gets moved onto the one you pick, then the others are archived (hidden, not deleted — reversible from the Archived filter).
                  </p>
                  {group.slice().sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)).map((f) => (
                    <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 8, marginBottom: 8 }}>
                      <div style={{ fontSize: 13.5 }}>
                        <strong>{f.parent_first_name} {f.parent_last_name}</strong>
                        <span style={{ color: 'var(--ink-soft)' }}> · {f.email || 'no email'} · {f.phone || 'no phone'}</span>
                        <br />
                        <span style={{ color: 'var(--ink-soft)', fontSize: 12.5 }}>
                          Created {f.created_at ? new Date(f.created_at).toLocaleDateString() : 'unknown'} ·{' '}
                          {(studentCounts[f.id] || []).length} student{(studentCounts[f.id] || []).length === 1 ? '' : 's'}
                          {(studentCounts[f.id] || []).length > 0 && `: ${studentCounts[f.id].join(', ')}`}
                        </span>
                      </div>
                      <button
                        className="btn small"
                        disabled={mergeBusy}
                        onClick={() => setMerging({ group, survivorId: f.id, survivorLabel: `${f.parent_first_name} ${f.parent_last_name}` })}
                      >
                        Keep this one
                      </button>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="toolbar">
        <input placeholder="Search families…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="active">Active only</option>
          <option value="archived">Archived only</option>
          <option value="all">All families</option>
        </select>
      </div>
      {filtered.length === 0 ? (
        <div className="card"><div className="empty"><h3>No families found</h3><p>Add a family, or adjust your search/filter.</p></div></div>
      ) : (
        <div className="table-wrap"><table>
          <thead><tr><SortTh label="Parent" sortKey="parent" sort={sort} /><SortTh label="Contact" sortKey="contact" sort={sort} /><SortTh label="Emergency" sortKey="emergency" sort={sort} /><th>Students</th><SortTh label="Created" sortKey="created" sort={sort} /><th></th></tr></thead>
          <tbody>
            {filtered.map((f) => (
              <tr key={f.id} style={f.archived ? { opacity: 0.55 } : undefined}>
                <td data-label="Parent"><strong>{f.parent_first_name} {f.parent_last_name}</strong>{f.archived && <span className="pill waitlist" style={{ marginLeft: 6 }}>Archived</span>}</td>
                <td data-label="Contact">{f.email || '—'}<br /><span style={{ color: 'var(--ink-soft)', fontSize: 13 }}>{f.phone}</span></td>
                <td data-label="Emergency">{f.emergency_contact_name || '—'}<br /><span style={{ color: 'var(--ink-soft)', fontSize: 13 }}>{f.emergency_contact_phone}</span></td>
                <td data-label="Students">{(studentCounts[f.id] || []).length || '—'}</td>
                <td data-label="Created">{f.created_at ? new Date(f.created_at).toLocaleDateString() : '—'}</td>
                <td><div className="row-actions">
                  <button className="btn ghost small" onClick={() => setEdit(f)}>Edit</button>
                  <button className="btn ghost small" onClick={() => toggleArchived(f)}>{f.archived ? 'Unarchive' : 'Archive'}</button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
      {edit && (
        <Modal title={edit.id ? 'Edit family' : 'Add family'} onClose={() => setEdit(null)} onSave={save} saving={saving}>
          <div className="field row2">
            <Field label="Parent first name" value={edit.parent_first_name} onChange={(e) => setEdit({ ...edit, parent_first_name: e.target.value })} />
            <Field label="Parent last name" value={edit.parent_last_name} onChange={(e) => setEdit({ ...edit, parent_last_name: e.target.value })} />
          </div>
          <div className="field row2">
            <Field label="Email" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} />
            <Field label="Phone" value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} />
          </div>
          <div className="field row2">
            <Field label="Emergency contact" value={edit.emergency_contact_name} onChange={(e) => setEdit({ ...edit, emergency_contact_name: e.target.value })} />
            <Field label="Emergency phone" value={edit.emergency_contact_phone} onChange={(e) => setEdit({ ...edit, emergency_contact_phone: e.target.value })} />
          </div>
          <Field label="Notes" textarea value={edit.notes || ''} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} />
        </Modal>
      )}
      {merging && (
        <Modal
          title="Merge these families?"
          onClose={() => setMerging(null)}
          onSave={() => runMerge(merging.group, merging.survivorId)}
          saving={mergeBusy}
          saveLabel={mergeBusy ? 'Merging…' : `Keep "${merging.survivorLabel}"`}
        >
          <p style={{ fontSize: 14.5 }}>
            Every student currently on the other record{merging.group.length > 2 ? 's' : ''} will be moved onto{' '}
            <strong>{merging.survivorLabel}</strong>. The other record{merging.group.length > 2 ? 's' : ''} will be archived
            (hidden, not deleted) — you can undo this from the Archived filter if it turns out to be wrong.
          </p>
          <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
            This does NOT copy contact info between records — {merging.survivorLabel}'s own email/phone/emergency contact stay
            exactly as they are. Edit them by hand afterward if the other record actually had the more current info.
          </p>
        </Modal>
      )}
      {bulkPreview && (
        <Modal
          title={`Merge all ${dupeGroups.length} duplicate group${dupeGroups.length > 1 ? 's' : ''}?`}
          onClose={() => setBulkPreview(false)}
          onSave={runBulkMergeAll}
          saving={bulkBusy}
          saveLabel={bulkBusy ? 'Merging…' : `Merge all ${dupeGroups.length}`}
        >
          <p style={{ fontSize: 14.5, marginBottom: 12 }}>
            In every group below, the record with the most recent "Created" date is kept — everyone else's students move onto
            it, and the older record(s) get archived. Review the list before confirming:
          </p>
          <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 8 }}>
            {dupeGroups.map((group, gi) => {
              const sorted = group.slice().sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
              const survivor = sorted[0]
              const losers = sorted.slice(1)
              return (
                <div key={gi} style={{ padding: '10px 12px', borderBottom: gi < dupeGroups.length - 1 ? '1px solid var(--line)' : 'none', fontSize: 13 }}>
                  <span style={{ color: '#2f7d5b', fontWeight: 600 }}>KEEP</span> {survivor.parent_first_name} {survivor.parent_last_name}
                  {' '}({survivor.created_at ? new Date(survivor.created_at).toLocaleDateString() : 'unknown'})
                  <br />
                  <span style={{ color: 'var(--ink-soft)' }}>
                    archives {losers.length} older record{losers.length > 1 ? 's' : ''} from{' '}
                    {[...new Set(losers.map((l) => l.created_at ? new Date(l.created_at).toLocaleDateString() : 'unknown'))].join(', ')}
                  </span>
                </div>
              )
            })}
          </div>
          <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 12 }}>
            As before, this doesn't copy contact info — it only moves students and archives the older records. Everything here
            is reversible from the Archived filter afterward.
          </p>
        </Modal>
      )}
    </>
  )
}

const BLANK_STUDENT = { first_name: '', last_name: '', grade: '', level: 'Beginner', family_id: '', season_status: 'inactive', medical_notes: '', notes: '' }
function Students() {
  const [rows, setRows] = useState(null)
  const [families, setFamilies] = useState([])
  const [edit, setEdit] = useState(null)
  const [saving, setSaving] = useState(false)
  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState('active')
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const sort = useSort('name')
  const [photoUrls, setPhotoUrls] = useState({})
  const [busyPhoto, setBusyPhoto] = useState('')
  const [viewing, setViewing] = useState(null)
  const [enrollMap, setEnrollMap] = useState({})
  const [enrolling, setEnrolling] = useState(null) // student being enrolled
  const [currentEnrollments, setCurrentEnrollments] = useState([])
  const [availableClasses, setAvailableClasses] = useState([])
  const [pickedClassIds, setPickedClassIds] = useState([])
  const [enrollBusy, setEnrollBusy] = useState(false)
  const [enrollNote, setEnrollNote] = useState('')
  const load = useCallback(async () => {
    const [s, f, enr] = await Promise.all([
      supabase.from('students').select('*, families(*)').order('last_name'),
      supabase.from('families').select('id, parent_first_name, parent_last_name').order('parent_last_name'),
      supabase.from('enrollments').select('student_id, status, classes(name)').eq('status', 'enrolled'),
    ])
    setRows(s.data || []); setFamilies(f.data || [])
    const em = {}
    for (const e of enr.data || []) {
      if (!e.classes) continue
      if (!em[e.student_id]) em[e.student_id] = []
      em[e.student_id].push(e.classes.name)
    }
    setEnrollMap(em)
    // Student photos live in a PRIVATE bucket; signed URLs are staff-only and expire.
    const paths = (s.data || []).map((r) => r.photo_path).filter(Boolean)
    if (paths.length) {
      const { data: signed } = await supabase.storage.from('student-photos').createSignedUrls(paths, 3600)
      const map = {}
      for (const it of signed || []) if (it.signedUrl) map[it.path] = it.signedUrl
      setPhotoUrls(map)
    } else setPhotoUrls({})
  }, [])
  useEffect(() => { load() }, [load])
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  async function openDeleteConfirm(s) {
    const [{ count: enrollCount }, { data: enrIds }] = await Promise.all([
      supabase.from('enrollments').select('id', { count: 'exact', head: true }).eq('student_id', s.id),
      supabase.from('enrollments').select('id').eq('student_id', s.id),
    ])
    let attendanceCount = 0
    if (enrIds && enrIds.length) {
      const { count } = await supabase.from('attendance').select('id', { count: 'exact', head: true }).in('enrollment_id', enrIds.map((e) => e.id))
      attendanceCount = count || 0
    }
    setConfirmDelete({ ...s, enrollCount: enrollCount || 0, attendanceCount })
  }
  async function doDelete() {
    setDeleting(true)
    await supabase.from('students').delete().eq('id', confirmDelete.id)
    setDeleting(false); setConfirmDelete(null); setEdit(null); load()
  }
  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  function toggleSelectAll(visibleIds) {
    setSelectedIds((prev) => {
      const allSelected = visibleIds.every((id) => prev.has(id))
      if (allSelected) {
        const next = new Set(prev)
        visibleIds.forEach((id) => next.delete(id))
        return next
      }
      return new Set([...prev, ...visibleIds])
    })
  }
  async function bulkSetStatus(status) {
    if (!selectedIds.size) return
    setBulkBusy(true)
    await supabase.from('students').update({ season_status: status }).in('id', [...selectedIds])
    setBulkBusy(false); setSelectedIds(new Set()); load()
  }
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(null)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  function selectAllInactive() {
    setSelectedIds(new Set((rows || []).filter((r) => r.season_status === 'inactive').map((r) => r.id)))
  }
  async function openBulkDeleteConfirm() {
    if (!selectedIds.size) return
    const ids = [...selectedIds]
    const { count: enrollCount } = await supabase.from('enrollments').select('id', { count: 'exact', head: true }).in('student_id', ids)
    const { data: enrIds } = await supabase.from('enrollments').select('id').in('student_id', ids)
    let attendanceCount = 0
    if (enrIds && enrIds.length) {
      const { count } = await supabase.from('attendance').select('id', { count: 'exact', head: true }).in('enrollment_id', enrIds.map((e) => e.id))
      attendanceCount = count || 0
    }
    setBulkDeleteConfirm({ count: ids.length, enrollCount: enrollCount || 0, attendanceCount })
  }
  async function doBulkDelete() {
    setBulkDeleting(true)
    await supabase.from('students').delete().in('id', [...selectedIds])
    setBulkDeleting(false); setBulkDeleteConfirm(null); setSelectedIds(new Set()); load()
  }
  async function uploadPhoto(s, e) {
    const file = e.target.files?.[0]; if (!file) return
    setBusyPhoto(s.id)
    const path = `students/${s.id}-${Date.now()}.jpg`
    await supabase.storage.from('student-photos').upload(path, file, { upsert: true, contentType: file.type })
    await supabase.from('students').update({ photo_path: path }).eq('id', s.id)
    setBusyPhoto(''); load()
  }
  // Pulls the SAME active classes shown on the Classes page — nothing
  // separate to keep in sync. Also loads this student's CURRENT
  // enrollments (any non-dropped status) so they can be dropped/removed
  // right here, not just added to.
  async function openEnroll(s) {
    setEnrolling(s); setPickedClassIds([]); setEnrollNote('')
    await refreshEnrollModal(s)
  }
  async function refreshEnrollModal(s) {
    const [{ data: cls }, { data: existing }] = await Promise.all([
      supabase.from('classes').select('id, name, day_of_week, start_time, capacity').eq('active', true).order('name'),
      supabase.from('enrollments').select('id, class_id, status, classes(name, day_of_week, start_time)').eq('student_id', s.id).neq('status', 'dropped'),
    ])
    setCurrentEnrollments(existing || [])
    const already = new Set((existing || []).map((e) => e.class_id))
    setAvailableClasses((cls || []).map((c) => ({ ...c, alreadyEnrolled: already.has(c.id) })))
  }
  function togglePickClass(id) {
    setPickedClassIds((ids) => ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id])
  }
  async function confirmEnroll() {
    if (!pickedClassIds.length) { setEnrollNote('Pick at least one class.'); return }
    setEnrollBusy(true)
    let waitlistedCount = 0
    for (const classId of pickedClassIds) {
      const cls = availableClasses.find((c) => c.id === classId)
      const status = await enrollStudentInClass(enrolling.id, classId, cls?.capacity)
      if (status === 'waitlist') waitlistedCount++
    }
    setEnrollBusy(false); setPickedClassIds([])
    setEnrollNote(waitlistedCount ? `Enrolled — ${waitlistedCount} class${waitlistedCount > 1 ? 'es' : ''} full, added to waitlist instead.` : 'Enrolled ✓')
    await refreshEnrollModal(enrolling)
    setTimeout(() => setEnrollNote(''), 2500)
    load()
  }
  // Drop = keep the history (attendance stays attached), just marks them
  // no longer active in that class. Remove = permanently delete the
  // enrollment row. Same distinction the Enrollments screen already uses.
  async function unenrollDrop(enr) {
    await supabase.from('enrollments').update({ status: 'dropped' }).eq('id', enr.id)
    await refreshEnrollModal(enrolling); load()
  }
  async function unenrollRemove(enr) {
    await supabase.from('enrollments').delete().eq('id', enr.id)
    await refreshEnrollModal(enrolling); load()
  }
  const [saveErr, setSaveErr] = useState('')
  async function save() {
    setSaving(true); setSaveErr('')
    const payload = { ...edit, family_id: edit.family_id || null }
    delete payload.families
    const { error } = edit.id
      ? await supabase.from('students').update(payload).eq('id', edit.id)
      : await supabase.from('students').insert(payload)
    setSaving(false)
    if (error) { setSaveErr(error.message || 'Could not save. Make sure the database is up to date.'); return }
    setEdit(null); load()
  }
  if (!rows) return <div className="loading">Loading…</div>
  const famOptions = [{ value: '', label: '— none —' }, ...families.map((f) => ({ value: f.id, label: `${f.parent_first_name} ${f.parent_last_name}` }))]
  const filtered = applySort(
    rows
      .filter((s) => `${s.first_name} ${s.last_name}`.toLowerCase().includes(q.toLowerCase()))
      .filter((s) => statusFilter === 'all' ? true : (s.season_status || 'active') === statusFilter),
    sort,
    {
      name: (s) => `${s.last_name} ${s.first_name}`.toLowerCase(),
      grade: (s) => s.grade || '',
      age: (s) => s.age || '',
      level: (s) => s.level || '',
      family: (s) => s.families ? `${s.families.parent_last_name} ${s.families.parent_first_name}`.toLowerCase() : '',
      registered: (s) => s.registered_at || '',
    }
  )
  return (
    <>
      <div className="page-head">
        <div><h1>Students</h1><p>Every dancer, linked to a family.</p></div>
        <button className="btn" onClick={() => setEdit({ ...BLANK_STUDENT })}>Add student</button>
      </div>
      <div className="toolbar">
        <input placeholder="Search students…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="active">Active only</option>
          <option value="inactive">Inactive only</option>
          <option value="all">All students</option>
        </select>
        <button className="btn ghost small" onClick={selectAllInactive}>Select all Inactive</button>
        {selectedIds.size > 0 && (
          <>
            <div className="spacer" />
            <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{selectedIds.size} selected</span>
            <button className="btn ghost small" disabled={bulkBusy} onClick={() => bulkSetStatus('inactive')}>Mark Inactive</button>
            <button className="btn ghost small" disabled={bulkBusy} onClick={() => bulkSetStatus('active')}>Mark Active</button>
            <button className="btn danger small" disabled={bulkBusy} onClick={openBulkDeleteConfirm}>Delete selected</button>
            <button className="btn ghost small" onClick={() => setSelectedIds(new Set())}>Clear</button>
          </>
        )}
      </div>
      {bulkDeleteConfirm && (
        <Modal
          title="Delete selected students?"
          onClose={() => setBulkDeleteConfirm(null)}
          onSave={doBulkDelete}
          saving={bulkDeleting}
          saveLabel={bulkDeleting ? 'Deleting…' : `Delete ${bulkDeleteConfirm.count} student${bulkDeleteConfirm.count > 1 ? 's' : ''}`}
        >
          <p style={{ fontSize: 14.5 }}>
            This permanently deletes <strong>{bulkDeleteConfirm.count}</strong> student{bulkDeleteConfirm.count > 1 ? 's' : ''},
            along with <strong>{bulkDeleteConfirm.enrollCount}</strong> enrollment{bulkDeleteConfirm.enrollCount === 1 ? '' : 's'} and{' '}
            <strong>{bulkDeleteConfirm.attendanceCount}</strong> attendance record{bulkDeleteConfirm.attendanceCount === 1 ? '' : 's'} tied to them.
            This cannot be undone.
          </p>
          <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Family records for these students are NOT deleted — only the student records themselves.</p>
        </Modal>
      )}
      {filtered.length === 0 ? (
        <div className="card"><div className="empty"><h3>No students found</h3><p>Add a student, or adjust your search.</p></div></div>
      ) : (
        <div className="table-wrap"><table>
          <thead><tr><th style={{ width: 32 }}><input type="checkbox" checked={filtered.length > 0 && filtered.every((s) => selectedIds.has(s.id))} onChange={() => toggleSelectAll(filtered.map((s) => s.id))} /></th><SortTh label="Student" sortKey="name" sort={sort} /><SortTh label="Grade" sortKey="grade" sort={sort} /><SortTh label="Age" sortKey="age" sort={sort} /><SortTh label="Level" sortKey="level" sort={sort} /><th>Classes</th><SortTh label="Family" sortKey="family" sort={sort} /><SortTh label="Registered" sortKey="registered" sort={sort} /><th></th></tr></thead>
          <tbody>
            {filtered.map((s) => (
              <tr key={s.id}>
                <td><input type="checkbox" checked={selectedIds.has(s.id)} onChange={() => toggleSelect(s.id)} /></td>
                <td data-label="Student">
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    {s.photo_path && photoUrls[s.photo_path]
                      ? <img src={photoUrls[s.photo_path]} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }} />
                      : <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--pine-soft)', display: 'grid', placeItems: 'center', color: 'var(--pine)', fontWeight: 600, fontSize: 14 }}>{(s.first_name || '?')[0]}{(s.last_name || '')[0] || ''}</div>}
                    <strong>{s.first_name} {s.last_name}</strong>
                  </div>
                </td>
                <td data-label="Grade">{s.grade || '—'}</td>
                <td data-label="Age">{s.age || '—'}</td>
                <td data-label="Level">{s.level || '—'}</td>
                <td data-label="Classes" style={{ fontSize: 13 }}>{(enrollMap[s.id] || []).length ? enrollMap[s.id].join(', ') : <span style={{ color: 'var(--ink-soft)' }}>—</span>}</td>
                <td data-label="Family">{s.families ? `${s.families.parent_first_name} ${s.families.parent_last_name}` : '—'}</td>
                <td data-label="Registered">{s.registered_at ? new Date(s.registered_at).toLocaleDateString() : '—'}</td>
                <td><div className="row-actions">
                  <label className="btn ghost small" style={{ cursor: 'pointer' }}>
                    {busyPhoto === s.id ? 'Uploading…' : 'Photo'}
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => uploadPhoto(s, e)} />
                  </label>
                  <button className="btn ghost small" onClick={() => openEnroll(s)}>Classes</button>
                  <button className="btn ghost small" onClick={() => setViewing(s)}>View</button>
                  <button className="btn ghost small" onClick={() => setEdit(s)}>Edit</button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
      {edit && (
        <Modal title={edit.id ? 'Edit student' : 'Add student'} onClose={() => setEdit(null)} onSave={save} saving={saving}>
          {saveErr && <div className="auth-err" style={{ marginBottom: 4 }}>{saveErr}</div>}
          <div className="field row2">
            <Field label="First name" value={edit.first_name} onChange={(e) => setEdit({ ...edit, first_name: e.target.value })} />
            <Field label="Last name" value={edit.last_name} onChange={(e) => setEdit({ ...edit, last_name: e.target.value })} />
          </div>
          <div className="field row2">
            <Field label="Grade" value={edit.grade || ''} onChange={(e) => setEdit({ ...edit, grade: e.target.value })} placeholder="e.g. 4th" />
            <Field label="Age" value={edit.age || ''} onChange={(e) => setEdit({ ...edit, age: e.target.value })} placeholder="e.g. 8" />
            <Field label="Level" value={edit.level} options={LEVELS} onChange={(e) => setEdit({ ...edit, level: e.target.value })} />
          </div>
          <Field label="Status" value={edit.season_status || 'active'} options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} onChange={(e) => setEdit({ ...edit, season_status: e.target.value })} />
          <div className="field row2">
            <Field label="Birthday" type="date" value={edit.birthday || ''} onChange={(e) => setEdit({ ...edit, birthday: e.target.value })} />
            <Field label="Family" value={edit.family_id || ''} options={famOptions} onChange={(e) => setEdit({ ...edit, family_id: e.target.value })} />
          </div>
          <Field label="Medical / allergies (staff only)" textarea value={edit.medical_notes || ''} onChange={(e) => setEdit({ ...edit, medical_notes: e.target.value })} placeholder="Allergies, conditions, medications leaders should know about" />
          <Field label="Notes" textarea value={edit.notes || ''} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} />
          <div style={{ marginTop: 10, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
            <p style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--brass-dark, #a3741f)', fontWeight: 600, marginBottom: 10 }}>Costume &amp; T-shirt sizing</p>
            <div className="field row2">
              <Field label="T-shirt size" value={edit.size_tshirt || ''} onChange={(e) => setEdit({ ...edit, size_tshirt: e.target.value })} placeholder="e.g. Youth M" />
              <Field label="Leotard size" value={edit.size_leotard || ''} onChange={(e) => setEdit({ ...edit, size_leotard: e.target.value })} />
            </div>
            <div className="field row2">
              <Field label="Dress size" value={edit.size_dress || ''} onChange={(e) => setEdit({ ...edit, size_dress: e.target.value })} />
              <Field label="Shoe size" value={edit.size_shoe || ''} onChange={(e) => setEdit({ ...edit, size_shoe: e.target.value })} />
            </div>
            <div className="field row2">
              <Field label="Girth" value={edit.size_girth || ''} onChange={(e) => setEdit({ ...edit, size_girth: e.target.value })} />
              <Field label="Height" value={edit.size_height || ''} onChange={(e) => setEdit({ ...edit, size_height: e.target.value })} />
            </div>
            <div className="field row2">
              <Field label="Waist" value={edit.size_waist || ''} onChange={(e) => setEdit({ ...edit, size_waist: e.target.value })} />
              <Field label="Bust" value={edit.size_bust || ''} onChange={(e) => setEdit({ ...edit, size_bust: e.target.value })} />
            </div>
            <div className="field row2">
              <Field label="Hips" value={edit.size_hips || ''} onChange={(e) => setEdit({ ...edit, size_hips: e.target.value })} />
              <Field label="Inseam" value={edit.size_inseam || ''} onChange={(e) => setEdit({ ...edit, size_inseam: e.target.value })} />
            </div>
            <Field label="Last measured" type="date" value={edit.size_measured_on || ''} onChange={(e) => setEdit({ ...edit, size_measured_on: e.target.value })} />
            <Field label="Size notes" textarea value={edit.size_notes || ''} onChange={(e) => setEdit({ ...edit, size_notes: e.target.value })} />
          </div>
          {edit.id && (
            <div style={{ marginTop: 10, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
              <button className="btn danger small" onClick={() => openDeleteConfirm(edit)}>Delete this student permanently</button>
            </div>
          )}
        </Modal>
      )}
      {confirmDelete && (
        <div className="overlay" onClick={() => setConfirmDelete(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head"><h2>Delete "{confirmDelete.first_name} {confirmDelete.last_name}"?</h2></div>
            <div className="modal-body">
              <p style={{ fontSize: 14.5 }}>This permanently deletes the student and cannot be undone. It will also permanently erase:</p>
              <ul style={{ margin: '10px 0 10px 20px', fontSize: 14.5 }}>
                <li><strong>{confirmDelete.enrollCount}</strong> enrollment record{confirmDelete.enrollCount !== 1 ? 's' : ''} (current and past classes)</li>
                <li><strong>{confirmDelete.attendanceCount}</strong> attendance record{confirmDelete.attendanceCount !== 1 ? 's' : ''}</li>
              </ul>
              <p style={{ fontSize: 13.5, color: 'var(--ink-soft)' }}>If this student is just taking a season off, use <strong>Status: Inactive</strong> instead — that keeps all of this history safe and they can come back later.</p>
            </div>
            <div className="modal-foot">
              <button className="btn ghost" onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button className="btn danger" onClick={doDelete} disabled={deleting} style={{ background: 'var(--danger)', color: '#fff', border: 'none' }}>
                {deleting ? 'Deleting…' : 'Yes, permanently delete'}
              </button>
            </div>
          </div>
        </div>
      )}
      {viewing && (
        <div className="overlay" onClick={() => setViewing(null)}>
          <div className="modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {viewing.photo_path && photoUrls[viewing.photo_path]
                ? <img src={photoUrls[viewing.photo_path]} alt="" style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover' }} />
                : <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--pine-soft)', display: 'grid', placeItems: 'center', color: 'var(--pine)', fontWeight: 600 }}>{(viewing.first_name || '?')[0]}{(viewing.last_name || '')[0] || ''}</div>}
              <h2 style={{ marginBottom: 0 }}>{viewing.first_name} {viewing.last_name}</h2>
            </div>
            <div className="modal-body view-profile">
              <div className="vp-row"><span>Grade</span><span>{viewing.grade || '—'}</span></div>
              <div className="vp-row"><span>Status</span><span>{(viewing.season_status || 'active') === 'active' ? 'Active' : 'Inactive'}</span></div>
              <div className="vp-row"><span>Level</span><span>{viewing.level || '—'}</span></div>
              <div className="vp-row"><span>Birthday</span><span>{viewing.birthday || '—'}</span></div>
              <div className="vp-row"><span>Classes</span><span>{(enrollMap[viewing.id] || []).join(', ') || '—'}</span></div>
              <div className="vp-row"><span>Registered</span><span>{viewing.registered_at ? new Date(viewing.registered_at).toLocaleDateString() : '—'}</span></div>

              <p className="vp-section">Family</p>
              {viewing.families ? (
                <>
                  <div className="vp-row"><span>Primary parent</span><span>{viewing.families.parent_first_name} {viewing.families.parent_last_name}</span></div>
                  <div className="vp-row"><span>Email</span><span>{viewing.families.email || '—'}</span></div>
                  <div className="vp-row"><span>Phone</span><span>{viewing.families.phone || '—'}</span></div>
                  {viewing.families.secondary_parent_name && (
                    <>
                      <div className="vp-row"><span>2nd parent</span><span>{viewing.families.secondary_parent_name}</span></div>
                      <div className="vp-row"><span>2nd parent contact</span><span>{viewing.families.secondary_parent_email} {viewing.families.secondary_parent_phone}</span></div>
                    </>
                  )}
                  <div className="vp-row"><span>Emergency contact</span><span>{viewing.families.emergency_contact_name || '—'} {viewing.families.emergency_contact_relationship && `(${viewing.families.emergency_contact_relationship})`}</span></div>
                  <div className="vp-row"><span>Emergency phone</span><span>{viewing.families.emergency_contact_phone || '—'}</span></div>
                </>
              ) : <p style={{ color: 'var(--ink-soft)', fontSize: 14 }}>No family linked.</p>}

              <p className="vp-section">Medical / Allergies (staff only)</p>
              <p style={{ fontSize: 14 }}>{viewing.medical_notes || '—'}</p>

              <p className="vp-section">Notes</p>
              <p style={{ fontSize: 14 }}>{viewing.notes || '—'}</p>

              <p className="vp-section">Costume &amp; T-shirt Sizing</p>
              <div className="vp-row"><span>T-shirt</span><span>{viewing.size_tshirt || '—'}</span></div>
              <div className="vp-row"><span>Leotard</span><span>{viewing.size_leotard || '—'}</span></div>
              <div className="vp-row"><span>Dress</span><span>{viewing.size_dress || '—'}</span></div>
              <div className="vp-row"><span>Shoe</span><span>{viewing.size_shoe || '—'}</span></div>
              <div className="vp-row"><span>Girth / Height / Waist</span><span>{[viewing.size_girth, viewing.size_height, viewing.size_waist].filter(Boolean).join(' / ') || '—'}</span></div>
              <div className="vp-row"><span>Bust / Hips / Inseam</span><span>{[viewing.size_bust, viewing.size_hips, viewing.size_inseam].filter(Boolean).join(' / ') || '—'}</span></div>
              <div className="vp-row"><span>Last measured</span><span>{viewing.size_measured_on || '—'}</span></div>
              {viewing.size_notes && <p style={{ fontSize: 14, marginTop: 6 }}>{viewing.size_notes}</p>}
            </div>
            <div className="modal-foot">
              <button className="btn ghost" onClick={() => setViewing(null)}>Close</button>
              <button className="btn" onClick={() => { setViewing(null); setEdit(viewing) }}>Edit this student</button>
            </div>
          </div>
        </div>
      )}
      {enrolling && (
        <Modal title={`${enrolling.first_name}'s classes`} onClose={() => setEnrolling(null)} onSave={confirmEnroll} saving={enrollBusy} saveLabel="Enroll in checked classes">
          {currentEnrollments.length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Currently in:</p>
              {currentEnrollments.map((e) => (
                <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 12px', border: '1px solid var(--line)', borderRadius: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 14 }}>
                    <strong>{e.classes?.name || '—'}</strong> <span className={`pill ${e.status}`} style={{ marginLeft: 6 }}>{e.status}</span>
                    <br /><span style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>{e.classes?.day_of_week} {e.classes?.start_time}</span>
                  </span>
                  <div className="row-actions">
                    <button className="btn ghost small" onClick={() => unenrollDrop(e)}>Drop</button>
                    <button className="btn danger small" onClick={() => unenrollRemove(e)}>Remove</button>
                  </div>
                </div>
              ))}
              <p style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4 }}>Drop keeps their history (e.g. past attendance) but marks them no longer active. Remove deletes the enrollment entirely.</p>
            </div>
          )}
          <p style={{ fontSize: 13.5, color: 'var(--ink-soft)', marginBottom: 10 }}>Add to another class — these are the same active classes shown on the Classes page.</p>
          {availableClasses.length === 0 ? (
            <p style={{ fontSize: 14 }}>No active classes yet — add one on the Classes screen first.</p>
          ) : (
            <div className="class-check-list" style={{ maxHeight: 220, overflowY: 'auto' }}>
              {availableClasses.map((c) => (
                <label key={c.id} className="class-check-row" style={{ opacity: c.alreadyEnrolled ? 0.5 : 1 }}>
                  <input type="checkbox" disabled={c.alreadyEnrolled} checked={pickedClassIds.includes(c.id)} onChange={() => togglePickClass(c.id)} />
                  <span>
                    <strong>{c.name}</strong>{c.alreadyEnrolled && <span style={{ marginLeft: 6, fontSize: 12, color: 'var(--ink-soft)' }}>(already in this class)</span>}
                    <br /><span style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>{c.day_of_week} {c.start_time}{c.capacity ? ` · capacity ${c.capacity}` : ''}</span>
                  </span>
                </label>
              ))}
            </div>
          )}
          {enrollNote && <p style={{ fontSize: 13.5, marginTop: 10, color: enrollNote.startsWith('Enrolled') ? 'var(--ok)' : 'var(--danger)' }}>{enrollNote}</p>}
        </Modal>
      )}
    </>
  )
}

function Enrollments({ initialClassFilter, onConsumeInitialFilter }) {
  const [rows, setRows] = useState(null)
  const [statusFilter, setStatusFilter] = useState('')
  const [students, setStudents] = useState([])
  const [classes, setClasses] = useState([])
  const [adding, setAdding] = useState(null)
  const [saving, setSaving] = useState(false)
  const [filterClass, setFilterClass] = useState('')
  useEffect(() => {
    if (initialClassFilter) { setFilterClass(initialClassFilter); onConsumeInitialFilter && onConsumeInitialFilter() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialClassFilter])
  const load = useCallback(async () => {
    const [e, s, c] = await Promise.all([
      supabase.from('enrollments').select('*, students(first_name, last_name, grade), classes(name, day_of_week)').order('created_at', { ascending: false }),
      supabase.from('students').select('id, first_name, last_name').order('last_name'),
      supabase.from('classes').select('id, name, capacity, day_of_week, start_time, end_time, instructor_name, level').eq('active', true).order('name'),
    ])
    setRows(e.data || []); setStudents(s.data || []); setClasses(c.data || [])
  }, [])
  useEffect(() => { load() }, [load])
  async function addEnrollment() {
    setSaving(true)
    await supabase.from('enrollments').insert({ student_id: adding.student_id, class_id: adding.class_id, status: 'enrolled' })
    await markStudentActive(adding.student_id)
    setSaving(false); setAdding(null); load()
  }
  async function setStatus(id, status) { await supabase.from('enrollments').update({ status }).eq('id', id); load() }
  async function remove(id) { await supabase.from('enrollments').delete().eq('id', id); load() }
  const [copied, setCopied] = useState('')
  async function copyEmails() {
    const { data } = await supabase.from('enrollments').select('students(families(email))').eq('class_id', filterClass).eq('status', 'enrolled')
    const emails = [...new Set((data || []).map((r) => r.students?.families?.email).filter(Boolean))]
    if (!emails.length) { setCopied('No emails found'); setTimeout(() => setCopied(''), 2500); return }
    await navigator.clipboard.writeText(emails.join('; '))
    setCopied(`Copied ${emails.length} email${emails.length > 1 ? 's' : ''} ✓`)
    setTimeout(() => setCopied(''), 2500)
  }
  const enrolledCountFor = (cid) => (rows || []).filter((r) => r.class_id === cid && r.status === 'enrolled').length
  const [groupBy, setGroupBy] = useState('')
  const [groupValue, setGroupValue] = useState('')
  const [broadcast, setBroadcast] = useState(null)
  const [bcSubject, setBcSubject] = useState('')
  const [bcMessage, setBcMessage] = useState('')
  const [bcSending, setBcSending] = useState(false)
  const [bcNote, setBcNote] = useState('')
  async function openBroadcast() {
    const { data } = await supabase.from('enrollments').select('students(families(email))').eq('class_id', filterClass).eq('status', 'enrolled')
    const emails = [...new Set((data || []).map((r) => r.students?.families?.email).filter(Boolean))]
    const cls = classes.find((c) => c.id === filterClass)
    setBcSubject(''); setBcMessage(''); setBcNote('')
    setBroadcast({ emails, className: cls?.name || 'class' })
  }
  function classGroupVal(c, by) {
    if (by === 'class') return c.name || ''
    if (by === 'day') return c.day_of_week || ''
    if (by === 'teacher') return c.teachers?.name || c.instructor_name || ''
    return ''
  }
  const [groupCopied, setGroupCopied] = useState('')
  async function copyGroupEmails() {
    const groupClasses = classes.filter((c) => classGroupVal(c, groupBy) === groupValue)
    const ids = groupClasses.map((c) => c.id)
    const { data } = await supabase.from('enrollments').select('students(families(email))').in('class_id', ids).eq('status', 'enrolled')
    const emails = [...new Set((data || []).map((r) => r.students?.families?.email).filter(Boolean))]
    if (!emails.length) { setGroupCopied('No emails found'); setTimeout(() => setGroupCopied(''), 2500); return }
    await navigator.clipboard.writeText(emails.join('; '))
    setGroupCopied(`Copied ${emails.length} email${emails.length > 1 ? 's' : ''} ✓`)
    setTimeout(() => setGroupCopied(''), 2500)
  }
  async function openGroupBroadcast() {
    const groupClasses = classes.filter((c) => classGroupVal(c, groupBy) === groupValue)
    const ids = groupClasses.map((c) => c.id)
    const { data } = await supabase.from('enrollments').select('students(families(email))').in('class_id', ids).eq('status', 'enrolled')
    const emails = [...new Set((data || []).map((r) => r.students?.families?.email).filter(Boolean))]
    setBcSubject(''); setBcMessage(''); setBcNote('')
    setBroadcast({ emails, className: `${groupValue} (${groupClasses.length} classes)` })
  }
  function openInEmailApp() {
    window.location.href = `mailto:?bcc=${encodeURIComponent(broadcast.emails.join(','))}&subject=${encodeURIComponent(bcSubject)}&body=${encodeURIComponent(bcMessage)}`
  }
  async function sendViaShine() {
    setBcSending(true); setBcNote('')
    const r = await sendFromShine({ subject: bcSubject, message: bcMessage, emails: broadcast.emails })
    setBcSending(false)
    if (!r.ok) setBcNote(`Could not send from Shine (${r.error}) — "Open in my email app" always works.`)
    else { setBcNote('Sent ✓'); setTimeout(() => setBroadcast(null), 1400) }
  }
  async function printRoster() {
    const cls = classes.find((c) => c.id === filterClass)
    if (!cls) return
    const { data: priv } = await supabase.from('privacy_settings').select('*').eq('id', 1).single()
    const enrolled = rows.filter((r) => r.class_id === filterClass && r.status === 'enrolled')
    const waitlist = rows.filter((r) => r.class_id === filterClass && r.status === 'waitlist')
    const nm = (r) => r.students ? `${r.students.first_name} ${r.students.last_name}` : '—'
    const dateCols = 8
    const blank = '<td>&nbsp;</td>'.repeat(dateCols)
    const showAge = !priv?.hide_student_ages
    const showEmg = !!priv?.show_emergency_contact
    const w = window.open('', '_blank')
    w.document.write(`<!doctype html><html><head><title>${cls.name} roster</title><style>
      body{font-family:Georgia,serif;margin:28px;color:#222}
      h1{font-size:19px;margin:0 0 2px} .sub{font-size:13px;color:#555;margin:0 0 4px}
      .legend{font-size:12px;margin:8px 0 14px}
      table{width:100%;border-collapse:collapse;font-size:13px}
      th,td{border:1px solid #999;padding:7px 8px;text-align:left;height:22px}
      th{background:#eee;font-size:11px} td:first-child{width:26px;text-align:center;color:#777}
      .wl{margin-top:18px;font-size:13px} .wl b{display:block;margin-bottom:4px}
      .line{margin-top:16px;font-size:13px}
      @media print { body{margin:10mm} }
    </style></head><body>
      <h1>${cls.name}${cls.level ? ` — ${cls.level}` : ''}</h1>
      <p class="sub">${cls.day_of_week || ''} ${cls.start_time || ''}${cls.end_time ? `–${cls.end_time}` : ''}${cls.instructor_name ? ` · ${cls.instructor_name}` : ''} · Printed ${new Date().toLocaleDateString()}</p>
      <p class="legend">Present: ✓ &nbsp;&nbsp; Tardy: T &nbsp;&nbsp; Absent: ○</p>
      <table><tr><th></th><th>Student</th>${showAge ? '<th>Age</th>' : ''}${showEmg ? '<th>Emergency</th>' : ''}${'<th>&nbsp;/&nbsp;</th>'.repeat(dateCols)}</tr>
      ${enrolled.map((r, i) => `<tr><td>${i + 1}</td><td>${nm(r)}</td>${showAge ? `<td>${r.students?.grade || ''}</td>` : ''}${showEmg ? '<td>&nbsp;</td>' : ''}${blank}</tr>`).join('')}
      ${'<tr><td>&nbsp;</td><td>&nbsp;</td>' + (showAge ? '<td>&nbsp;</td>' : '') + (showEmg ? '<td>&nbsp;</td>' : '') + blank + '</tr>'.repeat(2)}
      </table>
      <p class="line">Class Mom: ______________________________</p>
      ${waitlist.length ? `<div class="wl"><b>Waitlist</b>${waitlist.map(nm).join('<br>')}</div>` : ''}
    </body></html>`)
    w.document.close(); w.focus(); w.print()
  }
  async function printAllRosters() {
    const { data: priv } = await supabase.from('privacy_settings').select('*').eq('id', 1).single()
    const showAge = !priv?.hide_student_ages
    const showEmg = !!priv?.show_emergency_contact
    const dateCols = 8
    const blank = '<td>&nbsp;</td>'.repeat(dateCols)
    const activeClasses = classes.slice().sort((x, y) => (x.day_of_week || '').localeCompare(y.day_of_week || ''))
    const sections = activeClasses.map((cls) => {
      const enrolled = rows.filter((r) => r.class_id === cls.id && r.status === 'enrolled')
      const waitlist = rows.filter((r) => r.class_id === cls.id && r.status === 'waitlist')
      const nm = (r) => r.students ? `${r.students.first_name} ${r.students.last_name}` : '—'
      const teacher = cls.teachers?.name || cls.instructor_name || ''
      const room = cls.rooms?.name || cls.location || ''
      return `<section class="cls">
        <h1>${cls.name}${cls.level ? ` — ${cls.level}` : ''}</h1>
        <p class="sub">${cls.day_of_week || ''} ${cls.start_time || ''}${cls.end_time ? `–${cls.end_time}` : ''}${teacher ? ` · ${teacher}` : ''}${room ? ` · ${room}` : ''}</p>
        <p class="legend">Present: ✓ &nbsp; Tardy: T &nbsp; Absent: ○</p>
        <table><tr><th></th><th>Student</th>${showAge ? '<th>Age</th>' : ''}${showEmg ? '<th>Emergency</th>' : ''}${'<th>&nbsp;/&nbsp;</th>'.repeat(dateCols)}</tr>
        ${enrolled.map((r, i) => `<tr><td>${i + 1}</td><td>${nm(r)}</td>${showAge ? `<td>${r.students?.grade || ''}</td>` : ''}${showEmg ? '<td>&nbsp;</td>' : ''}${blank}</tr>`).join('')}
        ${'<tr><td>&nbsp;</td><td>&nbsp;</td>' + (showAge ? '<td>&nbsp;</td>' : '') + (showEmg ? '<td>&nbsp;</td>' : '') + blank + '</tr>'.repeat(2)}
        </table>
        <p class="line">Class Mom: ______________________________</p>
        ${waitlist.length ? `<div class="wl"><b>Waitlist</b>${waitlist.map(nm).join('<br>')}</div>` : ''}
      </section>`
    }).join('')
    const w = window.open('', '_blank')
    w.document.write(`<!doctype html><html><head><title>All class rosters</title><style>
      body{font-family:Georgia,serif;margin:24px;color:#222}
      .cls{page-break-after:always}
      .cls:last-child{page-break-after:auto}
      h1{font-size:19px;margin:0 0 2px} .sub{font-size:13px;color:#555;margin:0 0 4px}
      .legend{font-size:12px;margin:8px 0 12px}
      table{width:100%;border-collapse:collapse;font-size:13px}
      th,td{border:1px solid #999;padding:6px 8px;text-align:left;height:22px}
      th{background:#eee;font-size:11px} td:first-child{width:26px;text-align:center;color:#777}
      .wl{margin-top:14px;font-size:13px} .wl b{display:block;margin-bottom:4px}
      .line{margin-top:14px;font-size:13px}
      @media print { body{margin:10mm} }
    </style></head><body>${sections}</body></html>`)
    w.document.close(); w.focus(); w.print()
  }
  if (!rows) return <div className="loading">Loading…</div>
  const filtered = rows
    .filter((r) => filterClass ? r.class_id === filterClass : true)
    .filter((r) => statusFilter ? r.status === statusFilter : true)
  return (
    <>
      <div className="page-head">
        <div><h1>Enrollments</h1><p>Who is in which class. Add, move, or drop in one click.</p></div>
        <button className="btn" onClick={() => setAdding({ student_id: '', class_id: filterClass || '' })}>Enroll a student</button>
      </div>
      <div className="toolbar">
        <select value={filterClass} onChange={(e) => setFilterClass(e.target.value)}>
          <option value="">All classes</option>
          {classes.map((c) => {
            const n = enrolledCountFor(c.id)
            const cap = c.capacity ? ` (${n}/${c.capacity}${n >= c.capacity ? ' FULL' : ''})` : ''
            return <option key={c.id} value={c.id}>{c.name}{cap}</option>
          })}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          <option value="enrolled">Enrolled only</option>
          <option value="waitlist">Waitlist only</option>
          <option value="dropped">Dropped only</option>
        </select>
        {filterClass && <button className="btn ghost small" onClick={copyEmails}>{copied || 'Copy parent emails'}</button>}
        {filterClass && <button className="btn ghost small" onClick={printRoster}>Print roster</button>}
        {filterClass && <button className="btn ghost small" onClick={openBroadcast}>Email class</button>}
        <div className="spacer" />
        <span style={{ color: 'var(--ink-soft)', fontSize: 13 }}>{filtered.length} {statusFilter || 'total'}{statusFilter ? '' : ' enrollment'}{filtered.length !== 1 && !statusFilter ? 's' : ''}</span>
      </div>
      <div className="toolbar">
        <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Email a whole group — pick by:</span>
        <select value={groupBy} onChange={(e) => { setGroupBy(e.target.value); setGroupValue('') }}>
          <option value="">— none —</option>
          <option value="class">Class</option>
          <option value="day">Day of week</option>
          <option value="teacher">Teacher</option>
        </select>
        {groupBy && (
          <select value={groupValue} onChange={(e) => setGroupValue(e.target.value)}>
            <option value="">— pick —</option>
            {[...new Set(classes.map((c) => classGroupVal(c, groupBy)).filter(Boolean))].sort().map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        )}
        {groupBy && groupValue && <button className="btn ghost small" onClick={copyGroupEmails}>{groupCopied || 'Copy these emails'}</button>}
        {groupBy && groupValue && <button className="btn" onClick={openGroupBroadcast}>Email this group</button>}
        <div className="spacer" />
        <button className="btn ghost small" onClick={printAllRosters}>Print all class rosters</button>
      </div>
      {filtered.length === 0 ? (
        <div className="card"><div className="empty"><h3>No enrollments here</h3><p>Enroll a student to get started.</p></div></div>
      ) : (
        <div className="table-wrap"><table>
          <thead><tr><th>Student</th><th>Class</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {[...filtered].sort((x, y) => {
              // Enrolled first, then waitlisted, then dropped — within each
              // group, alphabetical by student name.
              const statusOrder = { enrolled: 0, waitlist: 1, dropped: 2 }
              const so = (statusOrder[x.status] ?? 3) - (statusOrder[y.status] ?? 3)
              if (so !== 0) return so
              const nx = x.students ? `${x.students.last_name} ${x.students.first_name}` : ''
              const ny = y.students ? `${y.students.last_name} ${y.students.first_name}` : ''
              return nx.localeCompare(ny)
            }).map((r, i, arr) => {
              const nm = r.students ? `${r.students.first_name} ${r.students.last_name}` : '—'
              const prev = i > 0 && arr[i - 1].students ? `${arr[i - 1].students.first_name} ${arr[i - 1].students.last_name}` : null
              const repeat = nm === prev
              return (
              <tr key={r.id}>
                <td data-label="Student">{repeat
                  ? <span style={{ color: 'var(--ink-soft)', fontSize: 13 }}>↳ same student</span>
                  : <strong>{nm}</strong>}</td>
                <td data-label="Class">{r.classes ? r.classes.name : '—'}<br /><span style={{ color: 'var(--ink-soft)', fontSize: 13 }}>{r.classes?.day_of_week}</span></td>
                <td data-label="Status"><span className={`pill ${r.status}`}>{r.status}</span></td>
                <td><div className="row-actions">
                  {r.status !== 'enrolled' && <button className="btn ghost small" onClick={() => setStatus(r.id, 'enrolled')}>Enroll</button>}
                  {r.status !== 'waitlist' && <button className="btn ghost small" onClick={() => setStatus(r.id, 'waitlist')}>Waitlist</button>}
                  {r.status !== 'dropped' && <button className="btn ghost small" onClick={() => setStatus(r.id, 'dropped')}>Drop</button>}
                  <button className="btn danger small" onClick={() => remove(r.id)}>Remove</button>
                </div></td>
              </tr>
            )})}
          </tbody>
        </table></div>
      )}
      {broadcast && (
        <div className="overlay" onClick={() => setBroadcast(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head"><h2>Email {broadcast.className}</h2></div>
            <div className="modal-body">
              <p style={{ fontSize: 13.5, color: 'var(--ink-soft)' }}>
                {broadcast.emails.length} parent email{broadcast.emails.length !== 1 ? 's' : ''}, sent as BCC so families never see each other's addresses.
              </p>
              <Field label="Subject" value={bcSubject} onChange={(e) => setBcSubject(e.target.value)} placeholder="No class this Monday" />
              <Field label="Message" textarea value={bcMessage} onChange={(e) => setBcMessage(e.target.value)} style={{ minHeight: 130 }} />
              {bcNote && <p style={{ fontSize: 13, color: bcNote.startsWith('Sent') ? 'var(--ok)' : 'var(--danger)' }}>{bcNote}</p>}
            </div>
            <div className="modal-foot" style={{ flexWrap: 'wrap' }}>
              <button className="btn ghost" onClick={() => setBroadcast(null)}>Cancel</button>
              <button className="btn ghost" onClick={openInEmailApp} disabled={!broadcast.emails.length || !bcSubject.trim()}>Open in my email app</button>
              <button className="btn" onClick={sendViaShine} disabled={bcSending || !bcSubject.trim() || !bcMessage.trim() || !broadcast.emails.length}>{bcSending ? 'Sending…' : 'Send from Shine'}</button>
            </div>
          </div>
        </div>
      )}
      {adding && (
        <Modal title="Enroll a student" onClose={() => setAdding(null)} onSave={addEnrollment} saving={saving} saveLabel="Enroll">
          <Field label="Student" value={adding.student_id} options={[{ value: '', label: '— choose —' }, ...students.map((s) => ({ value: s.id, label: `${s.first_name} ${s.last_name}` }))]} onChange={(e) => setAdding({ ...adding, student_id: e.target.value })} />
          <Field label="Class" value={adding.class_id} options={[{ value: '', label: '— choose —' }, ...classes.map((c) => ({ value: c.id, label: c.name }))]} onChange={(e) => setAdding({ ...adding, class_id: e.target.value })} />
        </Modal>
      )}
    </>
  )
}

// Students start Inactive by default (DB column default — see
// migration-15.sql) and are moved to Active automatically the moment a
// real enrollment (enrolled OR waitlisted — both mean "part of this
// season") is created for them. Called from every place an enrollment
// gets inserted, so nothing slips through.
async function markStudentActive(studentId) {
  await supabase.from('students').update({ season_status: 'active' }).eq('id', studentId)
}

// Same capacity-aware enrolling logic used by the public registration
// form, but by real class ID rather than fuzzy text matching — used when
// the class is picked directly from a list (e.g. the Students screen's
// "Enroll in class" button).
async function enrollStudentInClass(studentId, classId, capacity) {
  let status = 'enrolled'
  if (capacity) {
    const { count } = await supabase.from('enrollments').select('id', { count: 'exact', head: true }).eq('class_id', classId).eq('status', 'enrolled')
    if ((count ?? 0) >= capacity) status = 'waitlist'
  }
  await supabase.from('enrollments').insert({ student_id: studentId, class_id: classId, status })
  await markStudentActive(studentId)
  return status
}

// A small, curated set of public-site text fields Corrie can edit herself —
// deliberately NOT an open page-builder. Each field here maps to one
// specific hardcoded default in shine-public's code; if a key is ever
// missing from the database, the public site falls back to that default
// automatically, so this screen can never take the site down or leave a
// section blank.
const SITE_CONTENT_FIELDS = [
  { key: 'hero_headline', label: 'Homepage headline', where: 'Homepage — top banner' },
  { key: 'hero_subtext', label: 'Homepage subheading', where: 'Homepage — top banner', textarea: true },
  { key: 'hero_verse', label: 'Bible verse under the headline', where: 'Homepage — top banner', textarea: true },
  { key: 'donation_badge', label: 'Donation callout text', where: 'Homepage — top banner', textarea: true },
  { key: 'mission_headline', label: 'Mission section headline', where: 'Homepage — "Why Shine" section' },
  { key: 'mission_body', label: 'Mission section paragraph', where: 'Homepage — "Why Shine" section', textarea: true },
  { key: 'mission_chip_level', label: 'Skill-level chip (e.g. "Beginning to advanced")', where: 'Homepage — "Why Shine" section' },
  { key: 'registration_intro', label: 'Registration form intro paragraph', where: 'Registration form', textarea: true },
  { key: 'class_select_label', label: 'Class selection instructions', where: 'Registration form' },
  { key: 'not_sure_label', label: '"I\'m not sure" checkbox text', where: 'Registration form' },
  { key: 'meeting_aug28_label', label: 'First parent meeting — date, time, room', where: 'Registration form + confirmation email', textarea: true },
  { key: 'meeting_sep3_label', label: 'Second parent meeting — date, time, room', where: 'Registration form + confirmation email', textarea: true },
]

function SiteContent() {
  const [values, setValues] = useState(null)
  const [saving, setSaving] = useState(false)
  const [savedNote, setSavedNote] = useState('')
  const load = useCallback(async () => {
    const { data } = await supabase.from('site_content').select('key, value')
    const map = {}
    for (const row of data || []) map[row.key] = row.value
    setValues(map)
  }, [])
  useEffect(() => { load() }, [load])
  async function saveAll() {
    setSaving(true); setSavedNote('')
    const rows = SITE_CONTENT_FIELDS.map((f) => ({ key: f.key, value: values[f.key] ?? '', updated_at: new Date().toISOString() }))
    await supabase.from('site_content').upsert(rows, { onConflict: 'key' })
    setSaving(false); setSavedNote('Saved ✓'); setTimeout(() => setSavedNote(''), 2500)
  }
  if (!values) return <div className="loading">Loading…</div>
  const grouped = SITE_CONTENT_FIELDS.reduce((acc, f) => {
    (acc[f.where] = acc[f.where] || []).push(f)
    return acc
  }, {})
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Site Content</h1>
          <p>A curated set of text on the public site you can edit yourself, no code push needed. Meeting dates/times here are the SAME text used in the confirmation email — change it once here and both places update together.</p>
        </div>
        <button className="btn" onClick={saveAll} disabled={saving}>{saving ? 'Saving…' : 'Save all changes'}</button>
      </div>
      {savedNote && <div style={{ color: 'var(--brass)', fontWeight: 600, marginBottom: 14 }}>{savedNote}</div>}
      {Object.entries(grouped).map(([where, fields]) => (
        <div className="card" key={where} style={{ marginBottom: 18 }}>
          <h3 style={{ marginTop: 0, marginBottom: 14, fontSize: 15 }}>{where}</h3>
          {fields.map((f) => (
            <Field
              key={f.key}
              label={f.label}
              textarea={f.textarea}
              value={values[f.key] ?? ''}
              onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
              style={f.textarea ? { minHeight: 70 } : undefined}
            />
          ))}
        </div>
      ))}
    </>
  )
}

// Simple RSVP roster for the two Mandatory Parent Meeting dates. Reads off
// the same registrations already logged — no new data collection, just a
// dedicated view Corrie can sort and print/screenshot before each meeting.
// If this grows into recital ticket reservations or other one-off event
// forms later, this is the natural first screen of a broader "Events"
// section — kept small and single-purpose for now on purpose.
function ParentMeetings() {
  const [rows, setRows] = useState(null)
  const sort = useSort('date')
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('registrations')
        .select('id, parent_name, student_name, email, phone, meeting_aug28, meeting_sep3')
        .or('meeting_aug28.eq.true,meeting_sep3.eq.true')
        .order('submitted_date', { ascending: false })
      setRows(data || [])
    })()
  }, [])
  if (!rows) return <div className="loading">Loading…</div>
  // One row per meeting date selected — a family who checked both meetings
  // appears once under each date, since that's genuinely two RSVPs.
  const attendees = []
  for (const r of rows) {
    if (r.meeting_aug28) attendees.push({ ...r, dateLabel: 'Fri, Aug 28', dateSort: 1 })
    if (r.meeting_sep3) attendees.push({ ...r, dateLabel: 'Wed, Sep 2', dateSort: 2 })
  }
  const sorted = applySort(attendees, sort, {
    date: (a) => a.dateSort,
    parent: (a) => a.parent_name?.toLowerCase(),
    student: (a) => a.student_name?.toLowerCase(),
  })
  const countAug28 = attendees.filter((a) => a.dateSort === 1).length
  const countSep2 = attendees.filter((a) => a.dateSort === 2).length
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Parent Meetings</h1>
          <p>Who's coming to each Mandatory Parent Meeting, pulled straight from registrations. {countAug28} for Aug 28 · {countSep2} for Sep 2.</p>
        </div>
      </div>
      {sorted.length === 0 ? (
        <div className="card"><div className="empty"><h3>No RSVPs yet</h3><p>Meeting selections from registration will show up here.</p></div></div>
      ) : (
        <div className="table-wrap"><table>
          <thead><tr><SortTh label="Meeting date" sortKey="date" sort={sort} /><SortTh label="Parent" sortKey="parent" sort={sort} /><SortTh label="Student" sortKey="student" sort={sort} /><th>Contact</th></tr></thead>
          <tbody>
            {sorted.map((a, i) => (
              <tr key={`${a.id}-${a.dateSort}-${i}`}>
                <td data-label="Meeting date"><span className="pill enrolled">{a.dateLabel}</span></td>
                <td data-label="Parent">{a.parent_name}</td>
                <td data-label="Student">{a.student_name}</td>
                <td data-label="Contact"><span style={{ color: 'var(--ink-soft)', fontSize: 13 }}>{a.email} {a.phone}</span></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </>
  )
}
function Registrations() {
  // Registrations are now processed INSTANTLY at signup — the real family,
  // student, and enrollment records already exist by the time a row shows
  // up here. This screen is a LOG of what came in, not a queue needing
  // approval. (If a registration ever fails to create real records — e.g.
  // a network hiccup mid-submission — the fix is just to add that student
  // manually via Students -> Add student, using the info shown here.)
  const [rows, setRows] = useState(null)
  const [q, setQ] = useState('')
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [clearing, setClearing] = useState(false)
  const load = useCallback(async () => {
    const { data } = await supabase.from('registrations').select('*').order('submitted_date', { ascending: false }).limit(200)
    setRows(data || [])
  }, [])
  useEffect(() => { load() }, [load])
  function toggleSelect(id) {
    setSelectedIds((s) => { const next = new Set(s); next.has(id) ? next.delete(id) : next.add(id); return next })
  }
  function toggleSelectAll(visibleIds) {
    setSelectedIds((s) => (visibleIds.every((id) => s.has(id)) ? new Set() : new Set(visibleIds)))
  }
  async function clearSelected() {
    if (!selectedIds.size) return
    if (!confirm(`Clear ${selectedIds.size} registration${selectedIds.size > 1 ? 's' : ''} from this log? This only removes the log entry — it does NOT touch any student, family, or enrollment record already created.`)) return
    setClearing(true)
    await supabase.from('registrations').delete().in('id', [...selectedIds])
    setSelectedIds(new Set())
    setClearing(false)
    load()
  }
  if (!rows) return <div className="loading">Loading…</div>
  const filtered = rows.filter((r) => `${r.parent_name} ${r.student_name}`.toLowerCase().includes(q.toLowerCase()))
  return (
    <>
      <div className="page-head"><div><h1>Registrations</h1><p>Everyone who's registered through the website — already enrolled automatically. This is a log, not a queue; nothing here needs approval. Clearing entries here only tidies this log — it never touches the actual student, family, or enrollment records.</p></div></div>
      <div className="toolbar">
        <input placeholder="Search by parent or student name…" value={q} onChange={(e) => setQ(e.target.value)} />
        {selectedIds.size > 0 && (
          <>
            <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{selectedIds.size} selected</span>
            <button className="btn danger small" onClick={clearSelected} disabled={clearing}>{clearing ? 'Clearing…' : 'Clear selected'}</button>
          </>
        )}
      </div>
      {filtered.length === 0 ? (
        <div className="card"><div className="empty"><h3>No registrations yet</h3><p>Signups from the website show up here automatically.</p></div></div>
      ) : (
        <div className="table-wrap"><table>
          <thead><tr><th style={{ width: 32 }}><input type="checkbox" checked={filtered.length > 0 && filtered.every((r) => selectedIds.has(r.id))} onChange={() => toggleSelectAll(filtered.map((r) => r.id))} /></th><th>Parent</th><th>Student</th><th>Classes selected</th><th>Heard about us</th><th>Meeting</th><th>Submitted</th></tr></thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id}>
                <td><input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggleSelect(r.id)} /></td>
                <td data-label="Parent"><strong>{r.parent_name}</strong><br /><span style={{ color: 'var(--ink-soft)', fontSize: 13 }}>{r.email} {r.phone}</span></td>
                <td data-label="Student">{r.student_name}<br /><span className={`pill ${r.is_returning ? 'waitlist' : 'enrolled'}`} style={{ marginTop: 3, display: 'inline-block' }}>{r.is_returning ? 'Returning' : 'New'}</span></td>
                <td data-label="Classes selected">{r.interested_class || '—'}</td>
                <td data-label="Heard about us">{r.heard_about || '—'}</td>
                <td data-label="Meeting">
                  {r.meeting_aug28 && <span className="pill enrolled" style={{ marginRight: 4 }}>Aug 28</span>}
                  {r.meeting_sep3 && <span className="pill enrolled">Sep 3</span>}
                  {!r.meeting_aug28 && !r.meeting_sep3 && '—'}
                  {r.wants_donation && <><br /><span className="pill waitlist" style={{ marginTop: 4, display: 'inline-block' }} title="Checked the donation interest box at registration — this does not confirm a payment was made.">Donation interest</span></>}
                </td>
                <td data-label="Submitted">{new Date(r.submitted_date).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </>
  )
}
const BLANK_TEACHER = { name: '', email: '', phone: '', specialties: '', notes: '' }
// Reusable "copy emails / email this group" control — same behavior as
// Enrollments' group email (BCC, copy-to-clipboard, or send via Shine),
// packaged so Teachers and Volunteers can use it too without duplicating
// the whole broadcast flow.
function EmailGroupButton({ emails, label }) {
  const [open, setOpen] = useState(false)
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  async function copyEmails() {
    if (!emails.length) { setNote('No emails found'); setTimeout(() => setNote(''), 2500); return }
    await navigator.clipboard.writeText(emails.join('; '))
    setNote(`Copied ${emails.length} email${emails.length !== 1 ? 's' : ''} ✓`); setTimeout(() => setNote(''), 2500)
  }
  function openInEmailApp() {
    window.location.href = `mailto:?bcc=${encodeURIComponent(emails.join(','))}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`
  }
  async function sendViaShine() {
    setBusy(true)
    const r = await sendFromShine({ subject, message, emails })
    setBusy(false)
    if (!r.ok) setNote(`Could not send from Shine (${r.error}) — "Open in my email app" always works.`)
    else { setNote('Sent ✓'); setTimeout(() => setOpen(false), 1200) }
  }
  return (
    <>
      <button className="btn ghost small" onClick={copyEmails}>{note && !open ? note : `Copy ${label} emails`}</button>
      <button className="btn ghost small" onClick={() => { setOpen(true); setSubject(''); setMessage(''); setNote('') }}>Email {label}</button>
      {open && (
        <div className="overlay" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head"><h2>Email {label}</h2></div>
            <div className="modal-body">
              <p style={{ fontSize: 13.5, color: 'var(--ink-soft)' }}>{emails.length} email{emails.length !== 1 ? 's' : ''}, sent as BCC so no one sees anyone else's address.</p>
              <Field label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
              <Field label="Message" textarea value={message} onChange={(e) => setMessage(e.target.value)} style={{ minHeight: 120 }} />
              {note && <p style={{ fontSize: 13, color: note.startsWith('Sent') ? 'var(--ok)' : 'var(--danger)' }}>{note}</p>}
            </div>
            <div className="modal-foot" style={{ flexWrap: 'wrap' }}>
              <button className="btn ghost" onClick={() => setOpen(false)}>Cancel</button>
              <button className="btn ghost" onClick={openInEmailApp} disabled={!emails.length || !subject.trim()}>Open in my email app</button>
              <button className="btn" onClick={sendViaShine} disabled={busy || !subject.trim() || !message.trim() || !emails.length}>{busy ? 'Sending…' : 'Send from Shine'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function Teachers() {
  const [rows, setRows] = useState(null)
  const [edit, setEdit] = useState(null)
  const [saving, setSaving] = useState(false)
  const sort = useSort('name')
  const load = useCallback(async () => {
    const { data } = await supabase.from('teachers').select('*').order('name')
    setRows(data || [])
  }, [])
  useEffect(() => { load() }, [load])
  async function save() {
    setSaving(true)
    if (edit.id) await supabase.from('teachers').update(edit).eq('id', edit.id)
    else await supabase.from('teachers').insert(edit)
    setSaving(false); setEdit(null); load()
  }
  if (!rows) return <div className="loading">Loading…</div>
  const sortedRows = applySort(rows, sort, {
    name: (t) => (t.name || '').toLowerCase(),
    teaches: (t) => (t.specialties || '').toLowerCase(),
    contact: (t) => (t.email || t.phone || '').toLowerCase(),
  })
  const teacherEmails = rows.map((t) => t.email).filter(Boolean)
  return (
    <>
      <div className="page-head">
        <div><h1>Teachers</h1><p>Your teaching team. Names entered here appear as suggestions when you set a class instructor.</p></div>
        <button className="btn" onClick={() => setEdit({ ...BLANK_TEACHER })}>Add teacher</button>
      </div>
      <div className="toolbar">
        <EmailGroupButton emails={teacherEmails} label="teachers" />
      </div>
      {rows.length === 0 ? (
        <div className="card"><div className="empty"><h3>No teachers yet</h3><p>Add your teaching team to keep their contact info in one place.</p><button className="btn" onClick={() => setEdit({ ...BLANK_TEACHER })}>Add teacher</button></div></div>
      ) : (
        <div className="table-wrap"><table>
          <thead><tr><SortTh label="Name" sortKey="name" sort={sort} /><SortTh label="Teaches" sortKey="teaches" sort={sort} /><SortTh label="Contact" sortKey="contact" sort={sort} /><th></th></tr></thead>
          <tbody>
            {sortedRows.map((t) => (
              <tr key={t.id}>
                <td data-label="Name"><strong>{t.name}</strong></td>
                <td data-label="Teaches">{t.specialties || '—'}</td>
                <td data-label="Contact">{t.email || '—'}<br /><span style={{ color: 'var(--ink-soft)', fontSize: 13 }}>{t.phone}</span></td>
                <td><div className="row-actions"><button className="btn ghost small" onClick={() => setEdit(t)}>Edit</button></div></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
      {edit && (
        <Modal title={edit.id ? 'Edit teacher' : 'Add teacher'} onClose={() => setEdit(null)} onSave={save} saving={saving}>
          <Field label="Name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
          <div className="field row2">
            <Field label="Email" value={edit.email || ''} onChange={(e) => setEdit({ ...edit, email: e.target.value })} />
            <Field label="Phone" value={edit.phone || ''} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} />
          </div>
          <Field label="Teaches (specialties)" value={edit.specialties || ''} onChange={(e) => setEdit({ ...edit, specialties: e.target.value })} placeholder="e.g. Ballet, Tap" />
          <Field label="Notes" textarea value={edit.notes || ''} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} />
        </Modal>
      )}
    </>
  )
}

function Attendance({ myTeacherId }) {
  const [classes, setClasses] = useState([])
  const [classId, setClassId] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [roster, setRoster] = useState(null)
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState('')
  const [period, setPeriod] = useState({ start: '', end: '' })
  const [editingPeriod, setEditingPeriod] = useState(false)

  useEffect(() => {
    (async () => {
      let q = supabase.from('classes').select('id, name, day_of_week').eq('active', true).order('name')
      if (myTeacherId) q = q.eq('teacher_id', myTeacherId)
      const { data } = await q
      setClasses(data || [])
    })()
  }, [myTeacherId])

  const loadPeriod = useCallback(async () => {
    const { data } = await supabase.from('site_content').select('key, value').in('key', ['attendance_period_start', 'attendance_period_end'])
    const map = {}
    for (const row of data || []) map[row.key] = row.value
    setPeriod({ start: map.attendance_period_start || '', end: map.attendance_period_end || '' })
  }, [])
  useEffect(() => { loadPeriod() }, [loadPeriod])
  async function savePeriod() {
    await supabase.from('site_content').upsert([
      { key: 'attendance_period_start', value: period.start },
      { key: 'attendance_period_end', value: period.end },
    ], { onConflict: 'key' })
    setEditingPeriod(false)
  }

  const loadRoster = useCallback(async () => {
    if (!classId || !date) { setRoster(null); return }
    const { data: enr } = await supabase.from('enrollments').select('id, students(id, first_name, last_name, families(email, parent_first_name, parent_last_name))').eq('class_id', classId).eq('status', 'enrolled')
    const ids = (enr || []).map((e) => e.id)
    const existing = {}
    if (ids.length) {
      const { data: att } = await supabase.from('attendance').select('enrollment_id, present, status').eq('class_date', date).in('enrollment_id', ids)
      for (const a of att || []) existing[a.enrollment_id] = a.status || (a.present ? 'present' : 'absent')
    }
    setRoster((enr || []).map((e) => ({
      enrollment_id: e.id,
      student_id: e.students?.id,
      name: e.students ? `${e.students.first_name} ${e.students.last_name}` : '—',
      parentEmail: e.students?.families?.email || '',
      status: existing[e.id] ?? '',
    })))
  }, [classId, date])
  useEffect(() => { loadRoster() }, [loadRoster])

  // Tap cycles: unmarked → present → tardy → absent → unmarked
  const NEXT = { '': 'present', present: 'tardy', tardy: 'absent', absent: '' }
  function toggle(id) { setRoster(roster.map((r) => r.enrollment_id === id ? { ...r, status: NEXT[r.status] } : r)) }

  // Checks one student's tardy/absent counts for the current period against
  // the 2nd/3rd thresholds. attendance_alerts_sent guarantees each alert
  // fires exactly once per student per threshold per period, no matter how
  // many times attendance gets corrected — the insert is the lock: if a row
  // for this (student, alert_type, period) already exists, the insert fails
  // on the unique constraint and no duplicate email goes out.
  async function checkAlertsForStudent(r) {
    if (!period.start || !period.end || !r.student_id) return
    const { data: enrRows } = await supabase.from('enrollments').select('id').eq('student_id', r.student_id)
    const enrIds = (enrRows || []).map((e) => e.id)
    if (!enrIds.length) return
    const { data: attRows } = await supabase.from('attendance').select('status')
      .in('enrollment_id', enrIds).gte('class_date', period.start).lte('class_date', period.end)
    const tardyCount = (attRows || []).filter((a) => a.status === 'tardy').length
    const absentCount = (attRows || []).filter((a) => a.status === 'absent').length
    const checks = [
      ['tardy_2', tardyCount >= 2, 'tardy', 2],
      ['tardy_3', tardyCount >= 3, 'tardy', 3],
      ['absent_2', absentCount >= 2, 'absent', 2],
      ['absent_3', absentCount >= 3, 'absent', 3],
    ]
    for (const [alertType, hitThreshold, word, n] of checks) {
      if (!hitThreshold) continue
      const { error: lockErr } = await supabase.from('attendance_alerts_sent').insert({ student_id: r.student_id, alert_type: alertType, period_start: period.start })
      if (lockErr) continue // already sent this one — unique constraint blocked the duplicate
      const ord = n === 2 ? '2nd' : '3rd'
      const parentName = r.name.split(' ')[0]
      const subject = `Attendance alert: ${r.name} — ${ord} ${word}`
      const message = [
        `Hi ${parentName || 'there'},`, '',
        `This is a note that ${r.name} has reached their ${ord} ${word} of the current period (${period.start} to ${period.end}).`,
        n === 3 ? 'Please reach out if there is anything we can help with.' : '',
        '', 'Grace and Peace,', 'Corrie / Shine Dance Studio',
      ].filter(Boolean).join('\n')
      const recipients = [r.parentEmail, 'shineGHFC@gmail.com'].filter(Boolean)
      if (recipients.length) await sendFromShine({ subject, message, emails: recipients })
    }
  }

  async function save() {
    setSaving(true)
    const ids = roster.map((r) => r.enrollment_id)
    await supabase.from('attendance').delete().eq('class_date', date).in('enrollment_id', ids)
    const marked = roster.filter((r) => r.status)
    if (marked.length) {
      await supabase.from('attendance').insert(marked.map((r) => ({
        enrollment_id: r.enrollment_id, class_date: date, status: r.status,
        present: r.status === 'present' || r.status === 'tardy',
      })))
    }
    setSaving(false); setSavedMsg('Saved ✓'); setTimeout(() => setSavedMsg(''), 2500)
    // Fire-and-forget: alert checks run after save confirms, don't block the
    // "Saved" message on email sending.
    for (const r of roster.filter((r) => r.status === 'tardy' || r.status === 'absent')) checkAlertsForStudent(r)
  }

  const presentCount = roster ? roster.filter((r) => r.status === 'present' || r.status === 'tardy').length : 0
  const statusLabel = { present: '✓ Present', tardy: 'T Tardy', absent: '○ Absent', '': 'Tap to mark' }
  const statusPill = { present: 'enrolled', tardy: 'waitlist', absent: 'dropped', '': 'inactive' }
  return (
    <>
      <div className="page-head"><div><h1>Attendance</h1><p>Pick a class and a date, check off who's here, save.</p></div></div>
      {!myTeacherId && (
        <div className="card" style={{ marginBottom: 16 }}>
          {!editingPeriod ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13.5 }}>
                <strong>Attendance alert period:</strong>{' '}
                {period.start && period.end ? `${period.start} to ${period.end}` : <span style={{ color: '#b23838' }}>not set — 2nd/3rd tardy/absence alerts are OFF until this is set</span>}
              </span>
              <button className="btn ghost small" onClick={() => setEditingPeriod(true)}>{period.start ? 'Change period' : 'Set period'}</button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <label style={{ fontSize: 13 }}>Start <input type="date" value={period.start} onChange={(e) => setPeriod({ ...period, start: e.target.value })} /></label>
              <label style={{ fontSize: 13 }}>End <input type="date" value={period.end} onChange={(e) => setPeriod({ ...period, end: e.target.value })} /></label>
              <button className="btn small" onClick={savePeriod}>Save period</button>
              <button className="btn ghost small" onClick={() => setEditingPeriod(false)}>Cancel</button>
            </div>
          )}
          <p style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 8, marginBottom: 0 }}>
            2nd/3rd tardy and 2nd/3rd absence alerts email the parent (and shineGHFC@gmail.com) automatically, counted within this date range only. Update this at the start of each new semester — each alert only ever sends once per student per threshold per period, so changing the dates here starts a fresh count.
          </p>
        </div>
      )}
      <div className="toolbar">
        <select value={classId} onChange={(e) => setClassId(e.target.value)}>
          <option value="">— choose a class —</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.day_of_week})</option>)}
        </select>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <div className="spacer" />
        {roster && <span style={{ color: 'var(--ink-soft)', fontSize: 13 }}>{presentCount} of {roster.length} present</span>}
      </div>
      {!classId ? (
        <div className="card"><div className="empty"><h3>Choose a class</h3><p>Attendance shows the enrolled students for the class and date you pick.</p></div></div>
      ) : !roster ? (
        <div className="loading">Loading…</div>
      ) : roster.length === 0 ? (
        <div className="card"><div className="empty"><h3>No enrolled students</h3><p>This class has no students with "enrolled" status yet.</p></div></div>
      ) : (
        <>
          <div className="table-wrap"><table>
            <thead><tr><th>Student</th><th>Status (tap row to cycle)</th></tr></thead>
            <tbody>
              {roster.map((r) => (
                <tr key={r.enrollment_id} onClick={() => toggle(r.enrollment_id)} style={{ cursor: 'pointer' }}>
                  <td data-label="Student"><strong>{r.name}</strong></td>
                  <td data-label="Status"><span className={`pill ${statusPill[r.status]}`}>{statusLabel[r.status]}</span></td>
                </tr>
              ))}
            </tbody>
          </table></div>
          <div className="toolbar" style={{ marginTop: 16 }}>
            <button className="btn" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save attendance'}</button>
            {savedMsg && <span style={{ color: 'var(--ok, #2f7d5b)', fontSize: 14, fontWeight: 500 }}>{savedMsg}</span>}
          </div>
        </>
      )}
    </>
  )
}

const BUCKET = 'site-photos'
function Photos() {
  const [heroUrl, setHeroUrl] = useState(null)
  const [gallery, setGallery] = useState(null)
  const [busy, setBusy] = useState('')

  const load = useCallback(async () => {
    const { data: root } = await supabase.storage.from(BUCKET).list('', { limit: 100 })
    const hero = (root || []).find((f) => f.name === 'hero.jpg')
    setHeroUrl(hero ? supabase.storage.from(BUCKET).getPublicUrl('hero.jpg').data.publicUrl + '?v=' + Date.parse(hero.updated_at || hero.created_at || Date.now()) : null)
    const { data: gal } = await supabase.storage.from(BUCKET).list('gallery', { limit: 100 })
    setGallery((gal || []).filter((f) => f.name !== '.emptyFolderPlaceholder').map((f) => ({
      name: f.name,
      url: supabase.storage.from(BUCKET).getPublicUrl('gallery/' + f.name).data.publicUrl,
    })))
  }, [])
  useEffect(() => { load() }, [load])

  async function uploadHero(e) {
    const file = e.target.files?.[0]; if (!file) return
    setBusy('hero')
    await supabase.storage.from(BUCKET).upload('hero.jpg', file, { upsert: true, contentType: file.type })
    setBusy(''); load()
  }
  async function uploadGallery(e) {
    const files = Array.from(e.target.files || []); if (!files.length) return
    setBusy('gallery')
    for (const file of files) {
      const safe = Date.now() + '-' + file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')
      await supabase.storage.from(BUCKET).upload('gallery/' + safe, file, { contentType: file.type })
    }
    setBusy(''); load()
  }
  async function removeGallery(name) {
    await supabase.storage.from(BUCKET).remove(['gallery/' + name]); load()
  }

  if (gallery === null) return <div className="loading">Loading…</div>
  return (
    <>
      <div className="page-head"><div><h1>Photos</h1><p>These photos appear on the public website. Only upload photos that families have cleared for public use.</p></div></div>

      <div className="card card-pad" style={{ marginBottom: 20 }}>
        <h3 style={{ marginBottom: 10 }}>Hero photo (the big one at the top)</h3>
        {heroUrl
          ? <img src={heroUrl} alt="Current hero" style={{ maxWidth: 420, width: '100%', borderRadius: 10, marginBottom: 12 }} />
          : <p style={{ color: 'var(--ink-soft)', marginBottom: 12 }}>No custom hero uploaded yet — the site is using its built-in photo.</p>}
        <label className="btn" style={{ display: 'inline-block' }}>
          {busy === 'hero' ? 'Uploading…' : (heroUrl ? 'Replace hero photo' : 'Upload hero photo')}
          <input type="file" accept="image/*" onChange={uploadHero} style={{ display: 'none' }} disabled={busy !== ''} />
        </label>
        <p style={{ color: 'var(--ink-soft)', fontSize: 13, marginTop: 10 }}>Wide, landscape photos work best. The site darkens it slightly so the text stays readable.</p>
      </div>

      <div className="card card-pad">
        <h3 style={{ marginBottom: 10 }}>Gallery photos</h3>
        {gallery.length === 0
          ? <p style={{ color: 'var(--ink-soft)', marginBottom: 12 }}>No gallery photos yet — the site shows "coming soon" tiles.</p>
          : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12, marginBottom: 14 }}>
              {gallery.map((g) => (
                <div key={g.name} style={{ position: 'relative' }}>
                  <img src={g.url} alt="" style={{ width: '100%', height: 110, objectFit: 'cover', borderRadius: 8 }} />
                  <button className="btn danger small" style={{ position: 'absolute', top: 6, right: 6 }} onClick={() => removeGallery(g.name)}>✕</button>
                </div>
              ))}
            </div>}
        <label className="btn" style={{ display: 'inline-block' }}>
          {busy === 'gallery' ? 'Uploading…' : 'Add gallery photos'}
          <input type="file" accept="image/*" multiple onChange={uploadGallery} style={{ display: 'none' }} disabled={busy !== ''} />
        </label>
      </div>
    </>
  )
}

const BLANK_ANN = { title: '', message: '', starts_on: '', ends_on: '', active: true }
function Announcements() {
  const [rows, setRows] = useState(null)
  const [edit, setEdit] = useState(null)
  const [saving, setSaving] = useState(false)
  const load = useCallback(async () => {
    const { data } = await supabase.from('announcements').select('*').order('created_at', { ascending: false })
    setRows(data || [])
  }, [])
  useEffect(() => { load() }, [load])
  async function save() {
    setSaving(true)
    const payload = { ...edit, starts_on: edit.starts_on || null, ends_on: edit.ends_on || null }
    if (edit.id) await supabase.from('announcements').update(payload).eq('id', edit.id)
    else await supabase.from('announcements').insert(payload)
    setSaving(false); setEdit(null); load()
  }
  async function toggleActive(a) { await supabase.from('announcements').update({ active: !a.active }).eq('id', a.id); load() }
  async function remove(id) { await supabase.from('announcements').delete().eq('id', id); load() }
  if (!rows) return <div className="loading">Loading…</div>
  return (
    <>
      <div className="page-head">
        <div><h1>Announcements</h1><p>Breaks, closures, and news. Active announcements show as a banner on the public site and disappear after the end date.</p></div>
        <button className="btn" onClick={() => setEdit({ ...BLANK_ANN })}>Add announcement</button>
      </div>
      {rows.length === 0 ? (
        <div className="card"><div className="empty"><h3>No announcements</h3><p>Post one when there's a break or closure — e.g. "No classes the week of Thanksgiving."</p><button className="btn" onClick={() => setEdit({ ...BLANK_ANN })}>Add announcement</button></div></div>
      ) : (
        <div className="table-wrap"><table>
          <thead><tr><th>Announcement</th><th>Shows</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id}>
                <td data-label="Announcement"><strong>{a.title}</strong>{a.message && <><br /><span style={{ color: 'var(--ink-soft)', fontSize: 13 }}>{a.message}</span></>}</td>
                <td data-label="Shows">{a.starts_on || 'now'} → {a.ends_on || 'until removed'}</td>
                <td data-label="Status"><span className={`pill ${a.active ? 'enrolled' : 'inactive'}`}>{a.active ? 'Active' : 'Off'}</span></td>
                <td><div className="row-actions">
                  <button className="btn ghost small" onClick={() => setEdit({ ...a, starts_on: a.starts_on || '', ends_on: a.ends_on || '' })}>Edit</button>
                  <button className="btn ghost small" onClick={() => toggleActive(a)}>{a.active ? 'Turn off' : 'Turn on'}</button>
                  <button className="btn danger small" onClick={() => remove(a.id)}>Delete</button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
      {edit && (
        <Modal title={edit.id ? 'Edit announcement' : 'Add announcement'} onClose={() => setEdit(null)} onSave={save} saving={saving}>
          <Field label="Title (the banner text)" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} placeholder="No classes the week of Thanksgiving" />
          <Field label="Details (optional)" textarea value={edit.message || ''} onChange={(e) => setEdit({ ...edit, message: e.target.value })} placeholder="Classes resume Monday, December 1." />
          <div className="field row2">
            <Field label="Show starting (optional)" type="date" value={edit.starts_on} onChange={(e) => setEdit({ ...edit, starts_on: e.target.value })} />
            <Field label="Show until (optional)" type="date" value={edit.ends_on} onChange={(e) => setEdit({ ...edit, ends_on: e.target.value })} />
          </div>
        </Modal>
      )}
    </>
  )
}

const BLANK_POLICY = { title: '', body: '', sort_order: 0, active: true }
function Policies() {
  const [rows, setRows] = useState(null)
  const [edit, setEdit] = useState(null)
  const [saving, setSaving] = useState(false)
  const load = useCallback(async () => {
    const { data } = await supabase.from('policy_sections').select('*').order('sort_order')
    setRows(data || [])
  }, [])
  useEffect(() => { load() }, [load])
  async function save() {
    setSaving(true)
    const payload = { ...edit, sort_order: Number(edit.sort_order) || 0 }
    if (edit.id) await supabase.from('policy_sections').update(payload).eq('id', edit.id)
    else await supabase.from('policy_sections').insert(payload)
    setSaving(false); setEdit(null); load()
  }
  async function toggleActive(p) { await supabase.from('policy_sections').update({ active: !p.active }).eq('id', p.id); load() }
  async function remove(id) { await supabase.from('policy_sections').delete().eq('id', id); load() }
  if (!rows) return <div className="loading">Loading…</div>
  return (
    <>
      <div className="page-head">
        <div><h1>Policies &amp; Forms</h1><p>The content on the public site's Policies &amp; Forms page. Order is the small number — lower shows first.</p></div>
        <button className="btn" onClick={() => setEdit({ ...BLANK_POLICY, sort_order: rows.length })}>Add section</button>
      </div>
      {rows.length === 0 ? (
        <div className="card"><div className="empty"><h3>No policy sections yet</h3><p>Add one — meeting dates, recital info, attendance expectations, etc.</p><button className="btn" onClick={() => setEdit({ ...BLANK_POLICY })}>Add section</button></div></div>
      ) : (
        <div className="table-wrap"><table>
          <thead><tr><th>Order</th><th>Section</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td data-label="Order">{p.sort_order}</td>
                <td data-label="Section"><strong>{p.title}</strong><br /><span style={{ color: 'var(--ink-soft)', fontSize: 13 }}>{p.body.slice(0, 80)}{p.body.length > 80 ? '…' : ''}</span></td>
                <td data-label="Status"><span className={`pill ${p.active ? 'enrolled' : 'inactive'}`}>{p.active ? 'Visible' : 'Hidden'}</span></td>
                <td><div className="row-actions">
                  <button className="btn ghost small" onClick={() => setEdit(p)}>Edit</button>
                  <button className="btn ghost small" onClick={() => toggleActive(p)}>{p.active ? 'Hide' : 'Show'}</button>
                  <button className="btn danger small" onClick={() => remove(p.id)}>Delete</button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
      {edit && (
        <Modal title={edit.id ? 'Edit section' : 'Add section'} onClose={() => setEdit(null)} onSave={save} saving={saving}>
          <Field label="Section title" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} placeholder="e.g. Mandatory Parent Meetings" />
          <Field label="Body text" textarea value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} style={{ minHeight: 160 }} placeholder="Plain text — blank lines create paragraph breaks, lines starting with • become bullet points." />
          <Field label="Order (lower shows first)" type="number" value={edit.sort_order} onChange={(e) => setEdit({ ...edit, sort_order: e.target.value })} />
        </Modal>
      )}
    </>
  )
}

const BLANK_MEMBER = { name: '', role: '', bio: '', sort_order: 0, active: true }
function Team() {
  const [rows, setRows] = useState(null)
  const [edit, setEdit] = useState(null)
  const [saving, setSaving] = useState(false)
  const [busyPhoto, setBusyPhoto] = useState('')
  const load = useCallback(async () => {
    const { data } = await supabase.from('team_members').select('*').order('sort_order').order('created_at')
    setRows(data || [])
  }, [])
  useEffect(() => { load() }, [load])
  const photoUrl = (p) => p ? supabase.storage.from(BUCKET).getPublicUrl(p).data.publicUrl : null
  async function save() {
    setSaving(true)
    const payload = { ...edit, sort_order: Number(edit.sort_order) || 0 }
    if (edit.id) await supabase.from('team_members').update(payload).eq('id', edit.id)
    else await supabase.from('team_members').insert(payload)
    setSaving(false); setEdit(null); load()
  }
  async function uploadPhoto(member, e) {
    const file = e.target.files?.[0]; if (!file) return
    setBusyPhoto(member.id)
    const path = `team/${member.id}-${Date.now()}.jpg`
    await supabase.storage.from(BUCKET).upload(path, file, { upsert: true, contentType: file.type })
    await supabase.from('team_members').update({ photo_path: path }).eq('id', member.id)
    setBusyPhoto(''); load()
  }
  async function toggleActive(m) { await supabase.from('team_members').update({ active: !m.active }).eq('id', m.id); load() }
  async function remove(id) { await supabase.from('team_members').delete().eq('id', id); load() }
  if (!rows) return <div className="loading">Loading…</div>
  return (
    <>
      <div className="page-head">
        <div><h1>Our Team</h1><p>Bios and photos shown on the public site's "Meet the instructors" section. Only active members appear.</p></div>
        <button className="btn" onClick={() => setEdit({ ...BLANK_MEMBER })}>Add team member</button>
      </div>
      {rows.length === 0 ? (
        <div className="card"><div className="empty"><h3>No team members yet</h3><p>Add Corrie and the teaching team. Until then the public site shows simple placeholder cards.</p><button className="btn" onClick={() => setEdit({ ...BLANK_MEMBER })}>Add team member</button></div></div>
      ) : (
        <div className="table-wrap"><table>
          <thead><tr><th>Member</th><th>Bio</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id}>
                <td data-label="Member" style={{ minWidth: 180 }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    {photoUrl(m.photo_path)
                      ? <img src={photoUrl(m.photo_path)} alt="" style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover' }} />
                      : <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--pine-soft)', display: 'grid', placeItems: 'center', color: 'var(--pine)', fontWeight: 600 }}>{(m.name || '?')[0]}</div>}
                    <div><strong>{m.name}</strong><br /><span style={{ color: 'var(--brass-dark, #a3741f)', fontSize: 12.5, fontWeight: 600 }}>{m.role}</span></div>
                  </div>
                </td>
                <td data-label="Bio" style={{ maxWidth: 340 }}><span style={{ color: 'var(--ink-soft)', fontSize: 13.5 }}>{m.bio ? (m.bio.length > 120 ? m.bio.slice(0, 120) + '…' : m.bio) : '—'}</span></td>
                <td data-label="Status"><span className={`pill ${m.active ? 'enrolled' : 'inactive'}`}>{m.active ? 'Live' : 'Hidden'}</span></td>
                <td><div className="row-actions">
                  <label className="btn ghost small" style={{ cursor: 'pointer' }}>
                    {busyPhoto === m.id ? 'Uploading…' : 'Photo'}
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => uploadPhoto(m, e)} />
                  </label>
                  <button className="btn ghost small" onClick={() => setEdit(m)}>Edit</button>
                  <button className="btn ghost small" onClick={() => toggleActive(m)}>{m.active ? 'Hide' : 'Show'}</button>
                  <button className="btn danger small" onClick={() => remove(m.id)}>Delete</button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
      {edit && (
        <Modal title={edit.id ? 'Edit team member' : 'Add team member'} onClose={() => setEdit(null)} onSave={save} saving={saving}>
          <div className="field row2">
            <Field label="Name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            <Field label="Role" value={edit.role || ''} onChange={(e) => setEdit({ ...edit, role: e.target.value })} placeholder="Studio Director" />
          </div>
          <Field label="Bio (2–3 warm sentences)" textarea value={edit.bio || ''} onChange={(e) => setEdit({ ...edit, bio: e.target.value })} />
          <Field label="Sort order (lower = first)" type="number" value={edit.sort_order} onChange={(e) => setEdit({ ...edit, sort_order: e.target.value })} />
        </Modal>
      )}
    </>
  )
}

const BLANK_QUOTE = { quote: '', attribution: '', active: true }
function Testimonials() {
  const [rows, setRows] = useState(null)
  const [edit, setEdit] = useState(null)
  const [saving, setSaving] = useState(false)
  const load = useCallback(async () => {
    const { data } = await supabase.from('testimonials').select('*').order('created_at', { ascending: false })
    setRows(data || [])
  }, [])
  useEffect(() => { load() }, [load])
  async function save() {
    setSaving(true)
    if (edit.id) await supabase.from('testimonials').update(edit).eq('id', edit.id)
    else await supabase.from('testimonials').insert(edit)
    setSaving(false); setEdit(null); load()
  }
  async function toggleActive(t) { await supabase.from('testimonials').update({ active: !t.active }).eq('id', t.id); load() }
  async function remove(id) { await supabase.from('testimonials').delete().eq('id', id); load() }
  if (!rows) return <div className="loading">Loading…</div>
  return (
    <>
      <div className="page-head">
        <div><h1>Testimonials</h1><p>Real quotes from real parents, shown on the public site. The section stays hidden until at least one is live. Only use quotes parents gave permission to share.</p></div>
        <button className="btn" onClick={() => setEdit({ ...BLANK_QUOTE })}>Add quote</button>
      </div>
      {rows.length === 0 ? (
        <div className="card"><div className="empty"><h3>No quotes yet</h3><p>Ask a few parents for two sentences about what Shine means to their dancer. First names only is fine (e.g. "— Maria, Ballet IA parent").</p><button className="btn" onClick={() => setEdit({ ...BLANK_QUOTE })}>Add quote</button></div></div>
      ) : (
        <div className="table-wrap"><table>
          <thead><tr><th>Quote</th><th>From</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id}>
                <td data-label="Quote" style={{ maxWidth: 420 }}>"{t.quote.length > 140 ? t.quote.slice(0, 140) + '…' : t.quote}"</td>
                <td data-label="From">{t.attribution || '—'}</td>
                <td data-label="Status"><span className={`pill ${t.active ? 'enrolled' : 'inactive'}`}>{t.active ? 'Live' : 'Hidden'}</span></td>
                <td><div className="row-actions">
                  <button className="btn ghost small" onClick={() => setEdit(t)}>Edit</button>
                  <button className="btn ghost small" onClick={() => toggleActive(t)}>{t.active ? 'Hide' : 'Show'}</button>
                  <button className="btn danger small" onClick={() => remove(t.id)}>Delete</button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
      {edit && (
        <Modal title={edit.id ? 'Edit quote' : 'Add quote'} onClose={() => setEdit(null)} onSave={save} saving={saving}>
          <Field label="Quote (no quotation marks needed)" textarea value={edit.quote} onChange={(e) => setEdit({ ...edit, quote: e.target.value })} />
          <Field label="Attribution" value={edit.attribution || ''} onChange={(e) => setEdit({ ...edit, attribution: e.target.value })} placeholder="Maria, Ballet IA parent" />
        </Modal>
      )}
    </>
  )
}

// A safe, READ-ONLY view of a teacher's own classes — no edit, delete, or
// reassignment controls. This is what "My Classes" grants, distinct from
// the full admin "Classes" screen which can edit/delete ANY class.
function MyClasses({ myTeacherId }) {
  const [classes, setClasses] = useState(null)
  useEffect(() => {
    (async () => {
      let q = supabase.from('classes').select('*, rooms(name)').eq('active', true).order('day_of_week')
      if (myTeacherId) q = q.eq('teacher_id', myTeacherId)
      const { data } = await q
      setClasses(data || [])
    })()
  }, [myTeacherId])
  if (!classes) return <div className="loading">Loading…</div>
  return (
    <>
      <div className="page-head"><div><h1>My Classes</h1><p>Your classes this season — for reference. Ask Corrie if anything needs to change.</p></div></div>
      {!myTeacherId && <div className="card card-pad" style={{ marginBottom: 16 }}><p style={{ fontSize: 14 }}>Your login isn't linked to a teacher profile yet, so this shows every active class. Ask Corrie to link your account in Teacher Access for a scoped view.</p></div>}
      {classes.length === 0 ? (
        <div className="card"><div className="empty"><h3>No classes assigned yet</h3><p>Check back once Corrie assigns you a class.</p></div></div>
      ) : (
        <div className="table-wrap"><table>
          <thead><tr><th>Class</th><th>Level</th><th>When</th><th>Room</th></tr></thead>
          <tbody>{classes.map((c) => (
            <tr key={c.id}>
              <td data-label="Class"><strong>{c.name}</strong></td>
              <td data-label="Level">{c.level || '—'}</td>
              <td data-label="When">{c.day_of_week} {c.start_time}{c.end_time ? `–${c.end_time}` : ''}</td>
              <td data-label="Room">{c.rooms?.name || '—'}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </>
  )
}

function currentSeasonLabel() {
  // Shine's season runs roughly Aug-May. Aug or later = "this year-next year".
  const now = new Date()
  const y = now.getFullYear()
  return now.getMonth() >= 6 ? `${y}-${y + 1}` : `${y - 1}-${y}`
}

const BLANK_ROOM = { name: '', capacity: '' }
function Rooms() {
  const [rows, setRows] = useState(null)
  const [edit, setEdit] = useState(null)
  const [saving, setSaving] = useState(false)
  const load = useCallback(async () => {
    const { data } = await supabase.from('rooms').select('*').order('name')
    setRows(data || [])
  }, [])
  useEffect(() => { load() }, [load])
  async function save() {
    setSaving(true)
    const payload = { ...edit, capacity: edit.capacity === '' ? null : Number(edit.capacity) }
    if (edit.id) await supabase.from('rooms').update(payload).eq('id', edit.id)
    else await supabase.from('rooms').insert(payload)
    setSaving(false); setEdit(null); load()
  }
  async function remove(id) { await supabase.from('rooms').delete().eq('id', id); load() }
  if (!rows) return <div className="loading">Loading…</div>
  return (
    <>
      <div className="page-head">
        <div><h1>Rooms</h1><p>The spaces classes meet in. Assign a room to each class on the Classes screen.</p></div>
        <button className="btn" onClick={() => setEdit({ ...BLANK_ROOM })}>Add room</button>
      </div>
      {rows.length === 0 ? (
        <div className="card"><div className="empty"><h3>No rooms yet</h3><p>Add the rooms your classes use.</p><button className="btn" onClick={() => setEdit({ ...BLANK_ROOM })}>Add room</button></div></div>
      ) : (
        <div className="table-wrap"><table>
          <thead><tr><th>Room</th><th>Capacity</th><th></th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id}>
              <td data-label="Room"><strong>{r.name}</strong></td>
              <td data-label="Capacity">{r.capacity || '—'}</td>
              <td><div className="row-actions">
                <button className="btn ghost small" onClick={() => setEdit(r)}>Edit</button>
                <button className="btn danger small" onClick={() => remove(r.id)}>Delete</button>
              </div></td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
      {edit && (
        <Modal title={edit.id ? 'Edit room' : 'Add room'} onClose={() => setEdit(null)} onSave={save} saving={saving}>
          <Field label="Room name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="B21" />
          <Field label="Capacity (optional)" type="number" value={edit.capacity ?? ''} onChange={(e) => setEdit({ ...edit, capacity: e.target.value })} />
        </Modal>
      )}
    </>
  )
}

// Every screen a teacher account could ever be granted, with a plain-
// language note on what it actually exposes. Screens NOT in this list can
// never be granted to a teacher, no matter what — that's a hard safelist,
// not just a UI suggestion, enforced again when the nav actually renders.
const TEACHER_GRANTABLE = [
  { key: 'attendance', label: 'Attendance', note: 'Take attendance — automatically scoped to their own class(es) once linked to a teacher profile below.' },
  { key: 'my-classes', label: 'My Classes (view only)', note: 'See their own class schedule. Cannot edit anything. Safe default.' },
  { key: 'classes', label: 'Classes (full management)', note: '⚠ Powerful: can add, edit, retire, or delete ANY class — not just their own.' },
  { key: 'enrollments', label: 'Enrollments', note: '⚠ Can move/waitlist/drop students in any class, and see class rosters.' },
  { key: 'students', label: 'Students (full roster)', note: '⚠ Sees every student, including medical/allergy notes.' },
  { key: 'rooms', label: 'Rooms', note: 'Low risk — just room names and capacities.' },
  { key: 'teachers', label: 'Teacher roster', note: 'Low risk — teacher contact info.' },
  { key: 'photos', label: 'Photos', note: 'Low risk — manage public site photos.' },
  { key: 'team', label: 'Our Team', note: 'Low risk — manage public bios.' },
  { key: 'testimonials', label: 'Testimonials', note: 'Low risk — manage public quotes.' },
  { key: 'announcements', label: 'Announcements', note: 'Low risk — post public banners.' },
  { key: 'policies', label: 'Policies & Forms', note: 'Low risk — manage the public policies page content.' },
]
// Families, Registrations, and Volunteer Inquiries are never offered here —
// they're blocked for teacher logins at the DATABASE level (see migration-9),
// so granting them in this screen would do nothing but show empty tables.

function TeacherAccess() {
  const [rows, setRows] = useState(null)
  const [teachers, setTeachers] = useState([])
  const [edit, setEdit] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState('')
  const load = useCallback(async () => {
    const [sr, t] = await Promise.all([
      supabase.from('staff_roles').select('*, teachers(name)').order('created_at'),
      supabase.from('teachers').select('id, name').order('name'),
    ])
    setRows(sr.data || []); setTeachers(t.data || [])
  }, [])
  useEffect(() => { load() }, [load])

  async function save() {
    setSaveErr('')
    const payload = { role: edit.role, teacher_id: edit.teacher_id || null, allowed_screens: edit.allowed_screens, display_name: edit.display_name || null, email: edit.email || null }
    if (edit.isNew) {
      // The User ID must be the UUID from Supabase -> Authentication -> Users,
      // not an email address. Pasting the wrong thing used to fail silently:
      // the modal closed, the list reloaded, and nothing appeared.
      const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      if (!uuidRe.test((edit.user_id || '').trim())) {
        setSaveErr('That User ID doesn\'t look right. It needs to be the UUID from Supabase → Authentication → Users (a long code like 3f9a1c72-...), not an email address. Create the login there first, then copy the User UID column.')
        return
      }
    }
    setSaving(true)
    const { error } = edit.isNew
      ? await supabase.from('staff_roles').insert({ user_id: edit.user_id.trim(), ...payload })
      : await supabase.from('staff_roles').update(payload).eq('user_id', edit.user_id)
    setSaving(false)
    if (error) {
      console.error('Teacher Access save failed —', error)
      setSaveErr(`Couldn't save: ${error.message}${error.hint ? ` (${error.hint})` : ''}`)
      return // keep the modal open so the work isn't lost
    }
    setEdit(null); load()
  }
  async function remove(userId) {
    const { error } = await supabase.from('staff_roles').delete().eq('user_id', userId)
    if (error) { console.error('Teacher Access delete failed —', error); alert(`Couldn't remove: ${error.message}`) }
    load()
  }
  function toggleScreen(key) {
    setEdit((e) => ({ ...e, allowed_screens: e.allowed_screens.includes(key) ? e.allowed_screens.filter((k) => k !== key) : [...e.allowed_screens, key] }))
  }

  if (!rows) return <div className="loading">Loading…</div>
  return (
    <>
      <div className="page-head">
        <div><h1>Teacher Access</h1><p>Control exactly which screens each teacher login can see. Creating the actual login (email + password) is still done once in Supabase — this just controls what they see after they sign in.</p></div>
        <button className="btn" onClick={() => setEdit({ isNew: true, user_id: '', role: 'teacher', teacher_id: '', allowed_screens: ['attendance', 'my-classes'], display_name: '', email: '' })}>Add teacher login</button>
      </div>
      {rows.length === 0 ? (
        <div className="card"><div className="empty"><h3>No limited logins yet</h3><p>Anyone who logs in without a row here gets full admin access. Add a row to create a restricted teacher login.</p></div></div>
      ) : (
        <div className="table-wrap"><table>
          <thead><tr><th>Name</th><th>Role</th><th>Linked teacher</th><th>Can see</th><th></th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.user_id}>
              <td data-label="Name"><strong>{r.display_name || '(unnamed)'}</strong><br /><span style={{ color: 'var(--ink-soft)', fontSize: 13 }}>{r.email}</span></td>
              <td data-label="Role"><span className={`pill ${r.role === 'admin' ? 'enrolled' : 'waitlist'}`}>{r.role}</span></td>
              <td data-label="Linked teacher">{r.teachers?.name || '—'}</td>
              <td data-label="Can see" style={{ fontSize: 13 }}>{(r.allowed_screens || []).join(', ') || '—'}</td>
              <td><div className="row-actions">
                <button className="btn ghost small" onClick={() => setEdit({ ...r, isNew: false, allowed_screens: r.allowed_screens || [] })}>Edit</button>
                <button className="btn danger small" onClick={() => remove(r.user_id)}>Remove</button>
              </div></td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
      {edit && (
        <Modal title={edit.isNew ? 'Add teacher login' : 'Edit access'} onClose={() => { setEdit(null); setSaveErr('') }} onSave={save} saving={saving}>
          {saveErr && (
            <div style={{ background: '#fdecec', border: '1px solid #f3c9c9', color: '#b23838', padding: '10px 12px', borderRadius: 8, fontSize: 13.5, marginBottom: 12 }}>
              {saveErr}
            </div>
          )}
          {edit.isNew && (
            <>
              <Field label="User ID" value={edit.user_id} onChange={(e) => setEdit({ ...edit, user_id: e.target.value })} placeholder="Paste the UUID from Supabase → Authentication → Users" />
              <p style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginTop: -8 }}>Create the login itself in Supabase first (Authentication → Users → Add user), then paste their User UID here.</p>
            </>
          )}
          <div className="field row2">
            <Field label="Display name (for your reference)" value={edit.display_name || ''} onChange={(e) => setEdit({ ...edit, display_name: e.target.value })} placeholder="Serena" />
            <Field label="Email (for your reference)" value={edit.email || ''} onChange={(e) => setEdit({ ...edit, email: e.target.value })} />
          </div>
          <div className="field row2">
            <Field label="Role" value={edit.role} options={[{ value: 'teacher', label: 'Teacher (limited)' }, { value: 'admin', label: 'Admin (full access)' }]} onChange={(e) => setEdit({ ...edit, role: e.target.value })} />
            <Field label="Linked teacher profile" value={edit.teacher_id || ''} options={[{ value: '', label: '— none —' }, ...teachers.map((t) => ({ value: t.id, label: t.name }))]} onChange={(e) => setEdit({ ...edit, teacher_id: e.target.value })} />
          </div>
          {edit.role === 'admin' ? (
            <p style={{ fontSize: 13.5, color: 'var(--ink-soft)', background: 'var(--cream)', padding: 10, borderRadius: 8 }}>Admin role sees everything — screen selections below don't apply.</p>
          ) : (
            <>
              <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Screens this teacher can see:</p>
              {TEACHER_GRANTABLE.map((s) => (
                <label key={s.key} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 0', borderBottom: '1px solid var(--line)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={edit.allowed_screens.includes(s.key)} onChange={() => toggleScreen(s.key)} style={{ marginTop: 3 }} />
                  <span><span style={{ fontWeight: 500 }}>{s.label}</span><br /><span style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>{s.note}</span></span>
                </label>
              ))}
            </>
          )}
        </Modal>
      )}
    </>
  )
}

function SeasonRollover() {
  const [classes, setClasses] = useState(null)
  const [seasons, setSeasons] = useState([])
  const [targetSeason, setTargetSeason] = useState(currentSeasonLabel())
  const [selected, setSelected] = useState({})
  const [retireSource, setRetireSource] = useState(true)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState('')

  const load = useCallback(async () => {
    const { data } = await supabase.from('classes').select('*').order('season', { ascending: false }).order('day_of_week')
    setClasses(data || [])
    setSeasons([...new Set((data || []).map((c) => c.season || 'unlabeled'))])
  }, [])
  useEffect(() => { load() }, [load])

  const sourceSeason = seasons.find((s) => s !== targetSeason) || seasons[0]
  const sourceClasses = (classes || []).filter((c) => (c.season || 'unlabeled') === sourceSeason)

  useEffect(() => {
    setSelected(Object.fromEntries(sourceClasses.map((c) => [c.id, true])))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceSeason, classes])

  function toggle(id) { setSelected({ ...selected, [id]: !selected[id] }) }
  function toggleAll(v) { setSelected(Object.fromEntries(sourceClasses.map((c) => [c.id, v]))) }

  async function runRollover() {
    setRunning(true); setResult('')
    const toCopy = sourceClasses.filter((c) => selected[c.id])
    const payload = toCopy.map((c) => ({
      name: c.name, level: c.level, day_of_week: c.day_of_week, start_time: c.start_time,
      end_time: c.end_time, location: c.location, capacity: c.capacity, instructor_name: c.instructor_name,
      min_age: c.min_age, max_age: c.max_age, active: true, season: targetSeason,
    }))
    if (payload.length) await supabase.from('classes').insert(payload)
    // This is the actual fix for the leftover-active-old-season-class bug:
    // rolling forward never used to touch the SOURCE season's active flag,
    // so last season's classes silently stayed visible to parents on the
    // public registration form (which filters by active, not by season)
    // until someone remembered to retire each one by hand. Retiring the
    // whole source season here closes that gap at the point it's created,
    // instead of relying on it being caught later.
    let retiredCount = 0
    if (retireSource && sourceClasses.length) {
      const stillActive = sourceClasses.filter((c) => c.active)
      if (stillActive.length) {
        await supabase.from('classes').update({ active: false }).in('id', stillActive.map((c) => c.id))
        retiredCount = stillActive.length
      }
    }
    setRunning(false)
    setResult(
      `Copied ${payload.length} class${payload.length !== 1 ? 'es' : ''} into ${targetSeason}.` +
      (retiredCount ? ` Also retired ${retiredCount} class${retiredCount !== 1 ? 'es' : ''} from ${sourceSeason} so they no longer show up on the public registration form.` : '') +
      ` Students were NOT auto-enrolled — re-enroll returning students in the new season's classes via Enrollments.`
    )
    load()
  }

  if (!classes) return <div className="loading">Loading…</div>
  return (
    <>
      <div className="page-head"><div><h1>New Season Rollover</h1><p>Copy last season's classes forward instead of re-entering them by hand each year.</p></div></div>
      <div className="card card-pad" style={{ marginBottom: 20 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, marginBottom: 14, cursor: 'pointer' }}>
          <input type="checkbox" checked={retireSource} onChange={(e) => setRetireSource(e.target.checked)} />
          <span>Also retire {sourceSeason || 'the previous season'}'s classes when I run this — recommended, prevents old classes from silently staying visible to parents on the registration form.</span>
        </label>
        <p style={{ fontSize: 14, color: 'var(--ink-soft)', marginBottom: 14 }}>
          This copies the class SHAPE (name, day, time, location, instructor, capacity, age range) into a new season as fresh, empty classes.
          It deliberately does <strong>not</strong> copy enrollments — each year's roster should be a deliberate choice, not an assumption
          that everyone is returning. After running this, use Enrollments to add returning students to their new-season classes.
        </p>
        <div className="field row2">
          <Field label="Copy FROM season" value={sourceSeason || ''} options={seasons} onChange={() => {}} disabled />
          <Field label="Copy TO season (new)" value={targetSeason} onChange={(e) => setTargetSeason(e.target.value)} placeholder="e.g. 2026-2027" />
        </div>
      </div>
      {sourceClasses.length === 0 ? (
        <div className="card"><div className="empty"><h3>No classes found in {sourceSeason}</h3><p>Add classes first, or pick a different source season.</p></div></div>
      ) : (
        <>
          <div className="toolbar">
            <button className="btn ghost small" onClick={() => toggleAll(true)}>Select all</button>
            <button className="btn ghost small" onClick={() => toggleAll(false)}>Select none</button>
            <div className="spacer" />
            <span style={{ color: 'var(--ink-soft)', fontSize: 13 }}>{Object.values(selected).filter(Boolean).length} of {sourceClasses.length} selected</span>
          </div>
          <div className="table-wrap"><table>
            <thead><tr><th></th><th>Class</th><th>When</th><th>Instructor</th></tr></thead>
            <tbody>
              {sourceClasses.map((c) => (
                <tr key={c.id} onClick={() => toggle(c.id)} style={{ cursor: 'pointer' }}>
                  <td><input type="checkbox" checked={!!selected[c.id]} onChange={() => toggle(c.id)} onClick={(e) => e.stopPropagation()} /></td>
                  <td data-label="Class"><strong>{c.name}</strong></td>
                  <td data-label="When">{c.day_of_week} {c.start_time}</td>
                  <td data-label="Instructor">{c.instructor_name || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
          <div className="toolbar" style={{ marginTop: 16 }}>
            <button className="btn" onClick={runRollover} disabled={running || !targetSeason.trim()}>
              {running ? 'Copying…' : `Copy ${Object.values(selected).filter(Boolean).length} classes to ${targetSeason || '…'}`}
            </button>
          </div>
          {result && <div className="card card-pad" style={{ marginTop: 16 }}><p style={{ fontSize: 14 }}>{result}</p></div>}
        </>
      )}
    </>
  )
}

function PrivacySettings() {
  const [s, setS] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState('')
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('privacy_settings').select('*').eq('id', 1).single()
      setS(data)
    })()
  }, [])
  async function save() {
    setSaving(true)
    await supabase.from('privacy_settings').update(s).eq('id', 1)
    setSaving(false); setSaved('Saved ✓'); setTimeout(() => setSaved(''), 2000)
  }
  function toggle(key) { setS({ ...s, [key]: !s[key] }) }
  if (!s) return <div className="loading">Loading…</div>
  const ROWS = [
    ['hide_student_pictures', 'Hide student pictures', 'Student photos never appear on printed rosters or shared views, even to other staff without direct access.'],
    ['hide_parent_phone', 'Hide parent phone number', 'Hides phone numbers on printed rosters (still visible on the Families screen).'],
    ['show_emergency_contact', 'Show emergency contact info', 'Include emergency contact name/phone on printed rosters.'],
    ['show_medical_info', 'Show medical info on rosters', 'Include each student\'s medical/allergy notes on printed rosters. Off by default — most classes don\'t need this printed.'],
    ['hide_student_ages', 'Hide student ages', 'Hides age from printed rosters and class lists.'],
    ['show_teacher_names', 'Show teacher names', 'Show the assigned instructor on the public schedule and printed rosters.'],
  ]
  return (
    <>
      <div className="page-head"><div><h1>Privacy Settings</h1><p>Controls what appears on printed rosters and shared views across the whole studio. This does not affect what staff can see on screen, only what gets shown on exports and printouts.</p></div></div>
      <div className="card card-pad" style={{ maxWidth: 640 }}>
        {ROWS.map(([key, label, help]) => (
          <label key={key} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '12px 0', borderBottom: '1px solid var(--line)', cursor: 'pointer' }}>
            <input type="checkbox" checked={!!s[key]} onChange={() => toggle(key)} style={{ marginTop: 3 }} />
            <span>
              <span style={{ fontWeight: 500 }}>{label}</span>
              <br /><span style={{ color: 'var(--ink-soft)', fontSize: 13 }}>{help}</span>
            </span>
          </label>
        ))}
        <div style={{ marginTop: 18, display: 'flex', gap: 12, alignItems: 'center' }}>
          <button className="btn" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save settings'}</button>
          {saved && <span style={{ color: 'var(--ok)', fontSize: 14, fontWeight: 500 }}>{saved}</span>}
        </div>
      </div>
    </>
  )
}

const VOLUNTEER_ROLES = ['Studio Opener', 'Studio Closer', 'Class Helper', 'Assistant']
const BLANK_VOLUNTEER = { name: '', email: '', phone: '', roles: [], active: true, notes: '' }

function Volunteers() {
  const [tab, setTab] = useState('inquiries')
  const [inquiries, setInquiries] = useState(null)
  const [roster, setRoster] = useState(null)
  const [statusFilter, setStatusFilter] = useState('active')
  const [roleFilter, setRoleFilter] = useState('')
  const rosterSort = useSort('name')
  const [edit, setEdit] = useState(null)
  const [saving, setSaving] = useState(false)
  const [assigning, setAssigning] = useState(null) // an inquiry being turned into a roster entry
  const [assignRoles, setAssignRoles] = useState([])
  const [assignBusy, setAssignBusy] = useState(false)

  const loadInquiries = useCallback(async () => {
    const { data } = await supabase.from('volunteer_inquiries').select('*').eq('processed', false).order('submitted_date', { ascending: false })
    setInquiries(data || [])
  }, [])
  const loadRoster = useCallback(async () => {
    const { data } = await supabase.from('volunteers').select('*').order('name')
    setRoster(data || [])
  }, [])
  useEffect(() => { loadInquiries(); loadRoster() }, [loadInquiries, loadRoster])

  async function dismissInquiry(id) { await supabase.from('volunteer_inquiries').update({ processed: true }).eq('id', id); loadInquiries() }

  function toggleAssignRole(role) {
    setAssignRoles((r) => r.includes(role) ? r.filter((x) => x !== role) : [...r, role])
  }
  const [assignErr, setAssignErr] = useState('')
  async function confirmAssign() {
    setAssignBusy(true); setAssignErr('')
    const { error: rosterErr } = await supabase.from('volunteers').insert({
      name: assigning.name, email: assigning.email, phone: assigning.phone,
      roles: assignRoles, active: true, notes: assigning.message || null,
    })
    if (rosterErr) {
      console.error('Volunteers: add to roster failed —', rosterErr)
      setAssignErr(`Couldn't add to roster: ${rosterErr.message}`)
      setAssignBusy(false)
      return // inquiry is NOT marked processed — nothing is lost, modal stays open
    }
    // Only dismiss the inquiry once the roster entry is confirmed to exist —
    // this is the fix for the disappearing-inquiry bug: before, the inquiry
    // got marked processed regardless of whether the roster insert worked.
    const { error: dismissErr } = await supabase.from('volunteer_inquiries').update({ processed: true }).eq('id', assigning.id)
    if (dismissErr) console.error('Volunteers: dismissing inquiry after roster add failed —', dismissErr)
    setAssignBusy(false); setAssigning(null); setAssignRoles([]); loadInquiries(); loadRoster()
  }

  function toggleEditRole(role) {
    setEdit((e) => ({ ...e, roles: e.roles.includes(role) ? e.roles.filter((x) => x !== role) : [...e.roles, role] }))
  }
  async function save() {
    setSaving(true)
    const payload = { name: edit.name, email: edit.email || null, phone: edit.phone || null, roles: edit.roles, active: edit.active, notes: edit.notes || null }
    if (edit.id) await supabase.from('volunteers').update(payload).eq('id', edit.id)
    else await supabase.from('volunteers').insert(payload)
    setSaving(false); setEdit(null); loadRoster()
  }
  async function toggleActive(v) { await supabase.from('volunteers').update({ active: !v.active }).eq('id', v.id); loadRoster() }
  async function remove(id) { await supabase.from('volunteers').delete().eq('id', id); loadRoster() }

  if (inquiries === null || roster === null) return <div className="loading">Loading…</div>

  const filteredRoster = applySort(
    roster
      .filter((v) => statusFilter === 'all' ? true : v.active === (statusFilter === 'active'))
      .filter((v) => roleFilter ? (v.roles || []).includes(roleFilter) : true),
    rosterSort,
    {
      name: (v) => (v.name || '').toLowerCase(),
      roles: (v) => (v.roles || []).join(', ').toLowerCase(),
      contact: (v) => (v.email || v.phone || '').toLowerCase(),
      status: (v) => v.active ? 0 : 1,
    }
  )
  const rosterEmails = filteredRoster.map((v) => v.email).filter(Boolean)

  return (
    <>
      <div className="page-head"><div><h1>Volunteers</h1><p>Inquiries from the website, and the confirmed roster once someone's been given an assignment.</p></div></div>
      <div className="view-toggle" style={{ justifyContent: 'flex-start', marginBottom: 20 }}>
        <button className={tab === 'inquiries' ? 'active' : ''} onClick={() => setTab('inquiries')}>Inquiries{inquiries.length > 0 ? ` (${inquiries.length})` : ''}</button>
        <button className={tab === 'roster' ? 'active' : ''} onClick={() => setTab('roster')}>Active/Inactive Roster</button>
      </div>

      {tab === 'inquiries' && (
        inquiries.length === 0 ? (
          <div className="card"><div className="empty"><h3>No new inquiries</h3><p>Volunteer offers from the website show up here.</p></div></div>
        ) : (
          <div className="table-wrap"><table>
            <thead><tr><th>Name</th><th>Contact</th><th>How they'd help</th><th>When</th><th></th></tr></thead>
            <tbody>{inquiries.map((v) => (
              <tr key={v.id}>
                <td data-label="Name"><strong>{v.name}</strong></td>
                <td data-label="Contact">{v.email || '—'}<br /><span style={{ color: 'var(--ink-soft)', fontSize: 13 }}>{v.phone}</span></td>
                <td data-label="How they'd help">{v.message || '—'}</td>
                <td data-label="When">{new Date(v.submitted_date).toLocaleDateString()}</td>
                <td><div className="row-actions">
                  <button className="btn small" onClick={() => { setAssigning(v); setAssignRoles([]) }}>Add to roster</button>
                  <button className="btn ghost small" onClick={() => dismissInquiry(v.id)}>Dismiss</button>
                </div></td>
              </tr>
            ))}</tbody>
          </table></div>
        )
      )}

      {tab === 'roster' && (
        <>
          <div className="page-head" style={{ marginBottom: 12 }}>
            <div />
            <button className="btn" onClick={() => setEdit({ ...BLANK_VOLUNTEER })}>Add volunteer</button>
          </div>
          <div className="toolbar">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="active">Active only</option>
              <option value="inactive">Inactive only</option>
              <option value="all">All</option>
            </select>
            <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
              <option value="">All roles</option>
              {VOLUNTEER_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <div className="spacer" />
            <EmailGroupButton emails={rosterEmails} label="volunteers" />
          </div>
          {filteredRoster.length === 0 ? (
            <div className="card"><div className="empty"><h3>No volunteers here yet</h3><p>Add one manually, or move an inquiry over from the Inquiries tab.</p></div></div>
          ) : (
            <div className="table-wrap"><table>
              <thead><tr><SortTh label="Name" sortKey="name" sort={rosterSort} /><SortTh label="Roles" sortKey="roles" sort={rosterSort} /><SortTh label="Contact" sortKey="contact" sort={rosterSort} /><SortTh label="Status" sortKey="status" sort={rosterSort} /><th></th></tr></thead>
              <tbody>{filteredRoster.map((v) => (
                <tr key={v.id}>
                  <td data-label="Name"><strong>{v.name}</strong></td>
                  <td data-label="Roles" style={{ fontSize: 13 }}>{(v.roles || []).join(', ') || '—'}</td>
                  <td data-label="Contact">{v.email || '—'}<br /><span style={{ color: 'var(--ink-soft)', fontSize: 13 }}>{v.phone}</span></td>
                  <td data-label="Status"><span className={`pill ${v.active ? 'enrolled' : 'inactive'}`}>{v.active ? 'Active' : 'Inactive'}</span></td>
                  <td><div className="row-actions">
                    <button className="btn ghost small" onClick={() => setEdit({ ...v, roles: v.roles || [] })}>Edit</button>
                    <button className="btn ghost small" onClick={() => toggleActive(v)}>{v.active ? 'Set inactive' : 'Set active'}</button>
                    <button className="btn danger small" onClick={() => remove(v.id)}>Delete</button>
                  </div></td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </>
      )}

      {assigning && (
        <Modal title="Add to roster" onClose={() => { setAssigning(null); setAssignErr('') }} onSave={confirmAssign} saving={assignBusy} saveLabel="Add to roster">
          {assignErr && <div style={{ background: '#fdecec', border: '1px solid #f3c9c9', color: '#b23838', padding: '10px 12px', borderRadius: 8, fontSize: 13.5, marginBottom: 12 }}>{assignErr}</div>}
          <p style={{ fontSize: 14, color: 'var(--ink-soft)' }}>Adding <strong>{assigning.name}</strong> to the active volunteer roster. Pick their role(s):</p>
          {VOLUNTEER_ROLES.map((r) => (
            <label key={r} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '7px 0', cursor: 'pointer' }}>
              <input type="checkbox" checked={assignRoles.includes(r)} onChange={() => toggleAssignRole(r)} />
              <span>{r}</span>
            </label>
          ))}
        </Modal>
      )}

      {edit && (
        <Modal title={edit.id ? 'Edit volunteer' : 'Add volunteer'} onClose={() => setEdit(null)} onSave={save} saving={saving}>
          <Field label="Name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
          <div className="field row2">
            <Field label="Email" value={edit.email || ''} onChange={(e) => setEdit({ ...edit, email: e.target.value })} />
            <Field label="Phone" value={edit.phone || ''} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} />
          </div>
          <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Roles:</p>
          {VOLUNTEER_ROLES.map((r) => (
            <label key={r} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '6px 0', cursor: 'pointer' }}>
              <input type="checkbox" checked={edit.roles.includes(r)} onChange={() => toggleEditRole(r)} />
              <span>{r}</span>
            </label>
          ))}
          <label className="check" style={{ marginTop: 10 }}>
            <input type="checkbox" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} />
            <span>Active</span>
          </label>
          <Field label="Notes" textarea value={edit.notes || ''} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} />
        </Modal>
      )}
    </>
  )
}

function InterestList() {
  const [rows, setRows] = useState(null)
  const load = useCallback(async () => {
    const { data } = await supabase.from('contact_interest').select('*').order('created_at', { ascending: false })
    setRows(data || [])
  }, [])
  useEffect(() => { load() }, [load])
  async function remove(id) { await supabase.from('contact_interest').delete().eq('id', id); load() }
  if (!rows) return <div className="loading">Loading…</div>
  const emails = rows.map((r) => r.email).filter(Boolean)
  return (
    <>
      <div className="page-head"><div><h1>Interest List</h1><p>People who aren't enrolling right now but want to hear when new classes open up — from the "Just have questions?" link on the website.</p></div></div>
      <div className="toolbar">
        <EmailGroupButton emails={emails} label="the interest list" />
      </div>
      {rows.length === 0 ? (
        <div className="card"><div className="empty"><h3>No one on the list yet</h3><p>Signups from the website's "Just have questions?" link show up here.</p></div></div>
      ) : (
        <div className="table-wrap"><table>
          <thead><tr><th>Name</th><th>Contact</th><th>Message</th><th>When</th><th></th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id}>
              <td data-label="Name"><strong>{r.name}</strong></td>
              <td data-label="Contact">{r.email || '—'}<br /><span style={{ color: 'var(--ink-soft)', fontSize: 13 }}>{r.phone}</span></td>
              <td data-label="Message">{r.message || '—'}</td>
              <td data-label="When">{new Date(r.created_at).toLocaleDateString()}</td>
              <td><div className="row-actions"><button className="btn danger small" onClick={() => remove(r.id)}>Remove</button></div></td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </>
  )
}

const NAV = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'enrollments', label: 'Enrollments' },
  { key: 'attendance', label: 'Attendance' },
  { key: 'my-classes', label: 'My Classes' },
  { key: 'classes', label: 'Classes' },
  { key: 'rooms', label: 'Rooms' },
  { key: 'students', label: 'Students' },
  { key: 'families', label: 'Families' },
  { key: 'teachers', label: 'Teachers' },
  { key: 'teacher-access', label: 'Teacher Access' },
  { key: 'photos', label: 'Photos' },
  { key: 'team', label: 'Our Team' },
  { key: 'testimonials', label: 'Testimonials' },
  { key: 'announcements', label: 'Announcements' },
  { key: 'policies', label: 'Policies & Forms' },
  { key: 'site-content', label: 'Site Content' },
  { key: 'privacy', label: 'Privacy Settings' },
  { key: 'season', label: 'New Season' },
  { key: 'registrations', label: 'Registrations' },
  { key: 'parent-meetings', label: 'Parent Meetings' },
  { key: 'volunteers', label: 'Volunteers' },
  { key: 'interest', label: 'Interest List' },
]

// Hard safelist: no matter what Corrie checks in Teacher Access, a teacher
// login can NEVER see anything outside this list. This is enforced here in
// code, not just as a UI suggestion — it's the backstop if a bad value ever
// ends up in the database.
const TEACHER_MAX_GRANTABLE = ['attendance', 'my-classes', 'classes', 'enrollments', 'students', 'rooms', 'teachers', 'photos', 'team', 'testimonials', 'announcements', 'policies']

export default function App() {
  const [session, setSession] = useState(undefined)
  const [page, setPage] = useState('dashboard')
  const [newRegCount, setNewRegCount] = useState(0)
  const [isTeacher, setIsTeacher] = useState(false)
  const [myTeacherId, setMyTeacherId] = useState(null)
  const [allowedScreens, setAllowedScreens] = useState([])
  const [roleLoaded, setRoleLoaded] = useState(false)
  const [jumpClassId, setJumpClassId] = useState('')
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])
  useEffect(() => {
    if (!session) { setRoleLoaded(false); return }
    ;(async () => {
      const { data } = await supabase.from('staff_roles').select('role, teacher_id, allowed_screens').eq('user_id', session.user.id).maybeSingle()
      const teacher = data?.role === 'teacher'
      setIsTeacher(teacher)
      setMyTeacherId(data?.teacher_id || null)
      const granted = (data?.allowed_screens || ['attendance']).filter((k) => TEACHER_MAX_GRANTABLE.includes(k))
      setAllowedScreens(granted.length ? granted : ['attendance'])
      setRoleLoaded(true)
      if (teacher) setPage(granted.includes('attendance') ? 'attendance' : (granted[0] || 'attendance'))
    })()
  }, [session])
  const refreshRegCount = useCallback(async () => {
    if (isTeacher) return
    // Counts registrations since this browser last opened the Registrations
    // screen, not a fixed rolling window — so the badge actually clears when
    // you look at it, instead of just sitting there showing recent activity.
    // Falls back to 24 hours the very first time (nothing stored yet).
    const stored = localStorage.getItem('shine_registrations_last_viewed')
    const since = stored || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { count } = await supabase.from('registrations').select('id', { count: 'exact', head: true }).gt('submitted_date', since)
    setNewRegCount(count ?? 0)
  }, [isTeacher])
  useEffect(() => { if (session && roleLoaded) refreshRegCount() }, [session, page, roleLoaded, refreshRegCount])
  // Opening Registrations marks everything as seen right away — badge
  // clears instantly rather than waiting on the next poll.
  useEffect(() => {
    if (page === 'registrations') {
      localStorage.setItem('shine_registrations_last_viewed', new Date().toISOString())
      setNewRegCount(0)
    }
  }, [page])
  if (session === undefined) return <div className="loading">Loading…</div>
  if (!session) return <AuthScreen />
  if (!roleLoaded) return <div className="loading">Loading…</div>
  const visibleNav = isTeacher ? NAV.filter((n) => allowedScreens.includes(n.key)) : NAV.filter((n) => n.key !== 'my-classes')
  const safePage = isTeacher && !allowedScreens.includes(page) ? (allowedScreens[0] || 'attendance') : page
  return (
    <div className="app">
      <nav className="sidebar">
        <div className="brand">Shine<small>{isTeacher ? 'Teacher' : 'Dance Studio'}</small></div>
        {visibleNav.map((n) => (
          <button key={n.key} className={`navlink ${safePage === n.key ? 'active' : ''}`} onClick={() => setPage(n.key)}>
            {n.label}
            {n.key === 'registrations' && newRegCount > 0 && <span className="badge">{newRegCount}</span>}
          </button>
        ))}
        <button className="navlink signout" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </nav>
      <main className="main">
        {safePage === 'dashboard' && !isTeacher && <Dashboard go={setPage} />}
        {safePage === 'enrollments' && <Enrollments initialClassFilter={jumpClassId} onConsumeInitialFilter={() => setJumpClassId('')} />}
        {safePage === 'attendance' && <Attendance myTeacherId={isTeacher ? myTeacherId : null} />}
        {safePage === 'my-classes' && <MyClasses myTeacherId={myTeacherId} />}
        {safePage === 'classes' && <Classes onOpenRoster={(id) => { setJumpClassId(id); setPage('enrollments') }} />}
        {safePage === 'students' && <Students />}
        {safePage === 'families' && !isTeacher && <Families />}
        {safePage === 'teachers' && <Teachers />}
        {safePage === 'photos' && <Photos />}
        {safePage === 'team' && <Team />}
        {safePage === 'testimonials' && <Testimonials />}
        {safePage === 'announcements' && <Announcements />}
        {safePage === 'policies' && <Policies />}
        {safePage === 'site-content' && !isTeacher && <SiteContent />}
        {safePage === 'privacy' && !isTeacher && <PrivacySettings />}
        {safePage === 'season' && !isTeacher && <SeasonRollover />}
        {safePage === 'rooms' && <Rooms />}
        {safePage === 'registrations' && !isTeacher && <Registrations />}
        {safePage === 'parent-meetings' && !isTeacher && <ParentMeetings />}
        {safePage === 'volunteers' && !isTeacher && <Volunteers />}
        {safePage === 'interest' && !isTeacher && <InterestList />}
        {safePage === 'teacher-access' && !isTeacher && <TeacherAccess />}
      </main>
    </div>
  )
}
