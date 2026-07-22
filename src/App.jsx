import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabaseClient'

/* ============================================================
   Shine Dance Studio — internal management tool
   One file on purpose: easy to read top to bottom and hand off.
   ============================================================ */

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
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && signIn()} /></div>
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

function Classes() {
  const [rows, setRows] = useState(null)
  const [teachers, setTeachers] = useState([])
  const [edit, setEdit] = useState(null)
  const [saving, setSaving] = useState(false)
  const [seasonFilter, setSeasonFilter] = useState('')
  const [clsErr, setClsErr] = useState('')
  const [viewingClass, setViewingClass] = useState(null)
  const [rooms, setRooms] = useState([])
  const load = useCallback(async () => {
    const [c, t, rm] = await Promise.all([
      supabase.from('classes').select('*, rooms(name), teachers(name)').order('season', { ascending: false }).order('active', { ascending: false }).order('day_of_week'),
      supabase.from('teachers').select('id, name').order('name'),
      supabase.from('rooms').select('id, name').order('name'),
    ])
    setRows(c.data || []); setTeachers(t.data || []); setRooms(rm.data || [])
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
  const visible = seasonFilter ? rows.filter((c) => (c.season || 'unlabeled') === seasonFilter) : rows
  return (
    <>
      <div className="page-head">
        <div><h1>Classes</h1><p>Add or edit a class. Retire pauses a class (and can be restored); delete removes it permanently, from the Edit screen.</p></div>
        <button className="btn" onClick={() => { setClsErr(''); setEdit({ ...BLANK_CLASS, season: seasonFilter || undefined }) }}>Add class</button>
      </div>
      {allSeasons.length > 1 && (
        <div className="toolbar">
          <select value={seasonFilter} onChange={(e) => setSeasonFilter(e.target.value)}>
            {allSeasons.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <span style={{ color: 'var(--ink-soft)', fontSize: 13 }}>Showing {visible.length} of {rows.length} classes across all seasons</span>
        </div>
      )}
      {visible.length === 0 ? (
        <div className="card"><div className="empty"><h3>No classes yet</h3><p>Add your first class to start building the schedule.</p><button className="btn" onClick={() => setEdit({ ...BLANK_CLASS })}>Add class</button></div></div>
      ) : (
        <div className="table-wrap"><table>
          <thead><tr><th>Class</th><th>Level</th><th>When</th><th>Room</th><th>Instructor</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {visible.map((c) => (
              <tr key={c.id}>
                <td data-label="Class"><strong>{c.name}</strong></td>
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
  const [edit, setEdit] = useState(null)
  const [saving, setSaving] = useState(false)
  const [q, setQ] = useState('')
  const load = useCallback(async () => {
    const { data } = await supabase.from('families').select('*').order('parent_last_name')
    setRows(data || [])
  }, [])
  useEffect(() => { load() }, [load])
  async function save() {
    setSaving(true)
    if (edit.id) await supabase.from('families').update(edit).eq('id', edit.id)
    else await supabase.from('families').insert(edit)
    setSaving(false); setEdit(null); load()
  }
  if (!rows) return <div className="loading">Loading…</div>
  const filtered = rows.filter((f) => `${f.parent_first_name} ${f.parent_last_name} ${f.email}`.toLowerCase().includes(q.toLowerCase()))
  return (
    <>
      <div className="page-head">
        <div><h1>Families</h1><p>Parent contacts and emergency info.</p></div>
        <button className="btn" onClick={() => setEdit({ ...BLANK_FAMILY })}>Add family</button>
      </div>
      <div className="toolbar"><input placeholder="Search families…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {filtered.length === 0 ? (
        <div className="card"><div className="empty"><h3>No families found</h3><p>Add a family, or adjust your search.</p></div></div>
      ) : (
        <div className="table-wrap"><table>
          <thead><tr><th>Parent</th><th>Contact</th><th>Emergency</th><th></th></tr></thead>
          <tbody>
            {filtered.map((f) => (
              <tr key={f.id}>
                <td data-label="Parent"><strong>{f.parent_first_name} {f.parent_last_name}</strong></td>
                <td data-label="Contact">{f.email || '—'}<br /><span style={{ color: 'var(--ink-soft)', fontSize: 13 }}>{f.phone}</span></td>
                <td data-label="Emergency">{f.emergency_contact_name || '—'}<br /><span style={{ color: 'var(--ink-soft)', fontSize: 13 }}>{f.emergency_contact_phone}</span></td>
                <td><div className="row-actions"><button className="btn ghost small" onClick={() => setEdit(f)}>Edit</button></div></td>
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
    </>
  )
}

const BLANK_STUDENT = { first_name: '', last_name: '', grade: '', level: 'Beginner', family_id: '', medical_notes: '', notes: '' }
function Students() {
  const [rows, setRows] = useState(null)
  const [families, setFamilies] = useState([])
  const [edit, setEdit] = useState(null)
  const [saving, setSaving] = useState(false)
  const [q, setQ] = useState('')
  const [photoUrls, setPhotoUrls] = useState({})
  const [busyPhoto, setBusyPhoto] = useState('')
  const [viewing, setViewing] = useState(null)
  const [enrollMap, setEnrollMap] = useState({})
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
  async function uploadPhoto(s, e) {
    const file = e.target.files?.[0]; if (!file) return
    setBusyPhoto(s.id)
    const path = `students/${s.id}-${Date.now()}.jpg`
    await supabase.storage.from('student-photos').upload(path, file, { upsert: true, contentType: file.type })
    await supabase.from('students').update({ photo_path: path }).eq('id', s.id)
    setBusyPhoto(''); load()
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
  const filtered = rows.filter((s) => `${s.first_name} ${s.last_name}`.toLowerCase().includes(q.toLowerCase()))
  return (
    <>
      <div className="page-head">
        <div><h1>Students</h1><p>Every dancer, linked to a family.</p></div>
        <button className="btn" onClick={() => setEdit({ ...BLANK_STUDENT })}>Add student</button>
      </div>
      <div className="toolbar"><input placeholder="Search students…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {filtered.length === 0 ? (
        <div className="card"><div className="empty"><h3>No students found</h3><p>Add a student, or adjust your search.</p></div></div>
      ) : (
        <div className="table-wrap"><table>
          <thead><tr><th>Student</th><th>Grade</th><th>Level</th><th>Classes</th><th>Family</th><th></th></tr></thead>
          <tbody>
            {filtered.map((s) => (
              <tr key={s.id}>
                <td data-label="Student">
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    {s.photo_path && photoUrls[s.photo_path]
                      ? <img src={photoUrls[s.photo_path]} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }} />
                      : <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--pine-soft)', display: 'grid', placeItems: 'center', color: 'var(--pine)', fontWeight: 600, fontSize: 14 }}>{(s.first_name || '?')[0]}{(s.last_name || '')[0] || ''}</div>}
                    <strong>{s.first_name} {s.last_name}</strong>
                  </div>
                </td>
                <td data-label="Grade">{s.grade || '—'}</td>
                <td data-label="Level">{s.level || '—'}</td>
                <td data-label="Classes" style={{ fontSize: 13 }}>{(enrollMap[s.id] || []).length ? enrollMap[s.id].join(', ') : <span style={{ color: 'var(--ink-soft)' }}>—</span>}</td>
                <td data-label="Family">{s.families ? `${s.families.parent_first_name} ${s.families.parent_last_name}` : '—'}</td>
                <td><div className="row-actions">
                  <label className="btn ghost small" style={{ cursor: 'pointer' }}>
                    {busyPhoto === s.id ? 'Uploading…' : 'Photo'}
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => uploadPhoto(s, e)} />
                  </label>
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
            <Field label="Level" value={edit.level} options={LEVELS} onChange={(e) => setEdit({ ...edit, level: e.target.value })} />
          </div>
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
              <Field label="Last measured" type="date" value={edit.size_measured_on || ''} onChange={(e) => setEdit({ ...edit, size_measured_on: e.target.value })} />
            </div>
            <Field label="Size notes" textarea value={edit.size_notes || ''} onChange={(e) => setEdit({ ...edit, size_notes: e.target.value })} />
          </div>
        </Modal>
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
              <div className="vp-row"><span>Level</span><span>{viewing.level || '—'}</span></div>
              <div className="vp-row"><span>Birthday</span><span>{viewing.birthday || '—'}</span></div>
              <div className="vp-row"><span>Classes</span><span>{(enrollMap[viewing.id] || []).join(', ') || '—'}</span></div>

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
    </>
  )
}

function Enrollments() {
  const [rows, setRows] = useState(null)
  const [students, setStudents] = useState([])
  const [classes, setClasses] = useState([])
  const [adding, setAdding] = useState(null)
  const [saving, setSaving] = useState(false)
  const [filterClass, setFilterClass] = useState('')
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
    const { data, error } = await supabase.functions.invoke('send-broadcast', { body: { subject: bcSubject, message: bcMessage, emails: broadcast.emails } })
    setBcSending(false)
    if (error || data?.ok === false) setBcNote('Could not send from Shine — is the email setup finished? "Open in my email app" always works.')
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
  const filtered = filterClass ? rows.filter((r) => r.class_id === filterClass) : rows
  return (
    <>
      <div className="page-head">
        <div><h1>Enrollments</h1><p>Who is in which class. Add, move, or drop in one click.</p></div>
        <button className="btn" onClick={() => setAdding({ student_id: '', class_id: '' })}>Enroll a student</button>
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
        {filterClass && <button className="btn ghost small" onClick={copyEmails}>{copied || 'Copy parent emails'}</button>}
        {filterClass && <button className="btn ghost small" onClick={printRoster}>Print roster</button>}
        {filterClass && <button className="btn ghost small" onClick={openBroadcast}>Email class</button>}
        <div className="spacer" />
        <span style={{ color: 'var(--ink-soft)', fontSize: 13 }}>{filtered.length} enrollment{filtered.length !== 1 ? 's' : ''}</span>
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

// Enroll a student in every class named in the registration's
// comma-joined interested_class text, auto-waitlisting any that are full.
async function enrollInAllMatchedClasses(studentId, interestedClassText) {
  if (!interestedClassText) return
  const names = interestedClassText.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
  const { data: cls } = await supabase.from('classes').select('id, name, capacity').eq('active', true)
  for (const wanted of names) {
    const match = (cls || []).find((c) => wanted.includes(c.name.toLowerCase()) || c.name.toLowerCase().includes(wanted))
    if (!match) continue
    let status = 'enrolled'
    if (match.capacity) {
      const { count } = await supabase.from('enrollments').select('id', { count: 'exact', head: true }).eq('class_id', match.id).eq('status', 'enrolled')
      if ((count ?? 0) >= match.capacity) status = 'waitlist'
    }
    await supabase.from('enrollments').insert({ student_id: studentId, class_id: match.id, status })
  }
}

function normPhone(p) { return (p || '').replace(/\D/g, '') }

// Confidence-scored match search for "returning student" registrations.
// HIGH = student name matches AND (a parent name, phone, or email also matches).
// LOW  = only the student's name matches — could easily be a different kid.
async function findReturningMatches(r) {
  const [sFirst, ...sRest] = (r.student_name || '').trim().split(' ')
  const sLast = sRest.join(' ')
  if (!sFirst) return []
  let q = supabase.from('students').select('*, families(*)').ilike('first_name', sFirst)
  if (sLast) q = q.ilike('last_name', `%${sLast}%`)
  const { data: candidates } = await q
  if (!candidates || !candidates.length) return []

  const regPhones = [normPhone(r.phone), normPhone(r.secondary_parent_phone)].filter(Boolean)
  const regEmails = [(r.email || '').toLowerCase().trim(), (r.secondary_parent_email || '').toLowerCase().trim()].filter(Boolean)
  const regParentNames = [(r.parent_name || '').toLowerCase().trim(), (r.secondary_parent_name || '').toLowerCase().trim()].filter(Boolean)

  return candidates.map((c) => {
    const fam = c.families
    let confidence = 'low'
    if (fam) {
      const famNames = [`${fam.parent_first_name} ${fam.parent_last_name}`.toLowerCase().trim(), (fam.secondary_parent_name || '').toLowerCase().trim()].filter(Boolean)
      const famPhones = [normPhone(fam.phone), normPhone(fam.secondary_parent_phone)].filter(Boolean)
      const famEmails = [(fam.email || '').toLowerCase().trim(), (fam.secondary_parent_email || '').toLowerCase().trim()].filter(Boolean)
      const nameHit = famNames.some((n) => regParentNames.includes(n))
      const phoneHit = regPhones.some((p) => famPhones.includes(p))
      const emailHit = regEmails.some((e) => famEmails.includes(e))
      if (nameHit || phoneHit || emailHit) confidence = 'high'
    }
    return { student: c, family: fam, confidence }
  }).sort((a, b) => (a.confidence === 'high' ? -1 : 1) - (b.confidence === 'high' ? -1 : 1))
}

function Registrations({ onProcessed }) {
  const [rows, setRows] = useState(null)
  const [processing, setProcessing] = useState(null)
  const [busy, setBusy] = useState(false)
  const [matches, setMatches] = useState([])
  const [matchesLoaded, setMatchesLoaded] = useState(false)
  const [selectedMatchId, setSelectedMatchId] = useState('new')
  const load = useCallback(async () => {
    const { data } = await supabase.from('registrations').select('*').eq('processed', false).order('submitted_date', { ascending: false })
    setRows(data || [])
  }, [])
  useEffect(() => { load() }, [load])

  async function openProcessing(r) {
    setProcessing(r); setMatches([]); setMatchesLoaded(false); setSelectedMatchId('new')
    if (r.is_returning) {
      const found = await findReturningMatches(r)
      setMatches(found)
      // Pre-select the top match only if it's high confidence — never
      // pre-select a low-confidence guess, that decision stays with Corrie.
      setSelectedMatchId(found.length && found[0].confidence === 'high' ? found[0].student.id : 'new')
    }
    setMatchesLoaded(true)
  }

  // Create a brand-new family + student (today's original behavior).
  async function createNew(r) {
    const [firstName, ...rest] = (r.parent_name || '').trim().split(' ')
    const { data: fam } = await supabase.from('families').insert({
      parent_first_name: firstName || r.parent_name, parent_last_name: rest.join(' ') || '', email: r.email, phone: r.phone,
      secondary_parent_name: r.secondary_parent_name || null,
      secondary_parent_email: r.secondary_parent_email || null,
      secondary_parent_phone: r.secondary_parent_phone || null,
      emergency_contact_name: r.emergency_contact_name || null,
      emergency_contact_relationship: r.emergency_contact_relationship || null,
      emergency_contact_phone: r.emergency_contact_phone || null,
      notes: r.wants_donation ? 'Registration donation intent noted at signup.' : null,
    }).select().single()
    const [sFirst, ...sRest] = (r.student_name || '').trim().split(' ')
    const meetingNote = [
      r.meeting_aug28 ? 'Aug 28 meeting' : null,
      r.meeting_sep3 ? 'Sep 3 meeting' : null,
    ].filter(Boolean).join(' + ')
    const { data: stu } = await supabase.from('students').insert({
      first_name: sFirst || r.student_name, last_name: sRest.join(' ') || '', grade: r.student_grade,
      birthday: r.student_birthday || null, family_id: fam?.id || null,
      notes: meetingNote ? `Parent meeting selected at registration: ${meetingNote}.` : null,
    }).select().single()
    if (stu) await enrollInAllMatchedClasses(stu.id, r.interested_class)
  }

  // Reuse an existing student + family Corrie confirmed is the same person.
  // Only fills in BLANK fields — never overwrites data already on file.
  async function mergeIntoExisting(match, r) {
    const { student: stu, family: fam } = match
    if (fam) {
      const famUpdate = {}
      if (!fam.secondary_parent_name && r.secondary_parent_name) famUpdate.secondary_parent_name = r.secondary_parent_name
      if (!fam.secondary_parent_email && r.secondary_parent_email) famUpdate.secondary_parent_email = r.secondary_parent_email
      if (!fam.secondary_parent_phone && r.secondary_parent_phone) famUpdate.secondary_parent_phone = r.secondary_parent_phone
      if (!fam.emergency_contact_name && r.emergency_contact_name) famUpdate.emergency_contact_name = r.emergency_contact_name
      if (!fam.emergency_contact_relationship && r.emergency_contact_relationship) famUpdate.emergency_contact_relationship = r.emergency_contact_relationship
      if (!fam.emergency_contact_phone && r.emergency_contact_phone) famUpdate.emergency_contact_phone = r.emergency_contact_phone
      if (Object.keys(famUpdate).length) await supabase.from('families').update(famUpdate).eq('id', fam.id)
    }
    if (!stu.birthday && r.student_birthday) await supabase.from('students').update({ birthday: r.student_birthday }).eq('id', stu.id)
    await enrollInAllMatchedClasses(stu.id, r.interested_class)
  }

  async function process(r) {
    setBusy(true)
    if (selectedMatchId !== 'new') {
      const match = matches.find((m) => m.student.id === selectedMatchId)
      if (match) await mergeIntoExisting(match, r)
      else await createNew(r)
    } else {
      await createNew(r)
    }
    await supabase.from('registrations').update({ processed: true }).eq('id', r.id)
    setBusy(false); setProcessing(null); load(); onProcessed && onProcessed()
  }
  async function dismiss(id) { await supabase.from('registrations').update({ processed: true }).eq('id', id); load(); onProcessed && onProcessed() }
  if (!rows) return <div className="loading">Loading…</div>
  return (
    <>
      <div className="page-head"><div><h1>New registrations</h1><p>Review each submission, then add the family to your roster.</p></div></div>
      {rows.length === 0 ? (
        <div className="card"><div className="empty"><h3>You're all caught up</h3><p>New registrations from the public site will show up here.</p></div></div>
      ) : (
        <div className="table-wrap"><table>
          <thead><tr><th>Parent</th><th>Student</th><th>Interest</th><th>Meeting</th><th>Submitted</th><th></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td data-label="Parent"><strong>{r.parent_name}</strong><br /><span style={{ color: 'var(--ink-soft)', fontSize: 13 }}>{r.email} {r.phone}</span></td>
                <td data-label="Student">{r.student_name}<br /><span style={{ color: 'var(--ink-soft)', fontSize: 13 }}>{r.student_grade}</span><br /><span className={`pill ${r.is_returning ? 'waitlist' : 'enrolled'}`} style={{ marginTop: 3, display: 'inline-block' }}>{r.is_returning ? 'Returning' : 'New'}</span></td>
                <td data-label="Interest">{r.interested_class || '—'}</td>
                <td data-label="Meeting">
                  {r.meeting_aug28 && <span className="pill enrolled" style={{ marginRight: 4 }}>Aug 28</span>}
                  {r.meeting_sep3 && <span className="pill enrolled">Sep 3</span>}
                  {!r.meeting_aug28 && !r.meeting_sep3 && '—'}
                  {r.wants_donation && <><br /><span className="pill waitlist" style={{ marginTop: 4, display: 'inline-block' }} title="Checked the donation interest box at registration — this does not confirm a payment was made.">Donation interest</span></>}
                </td>
                <td data-label="Submitted">{new Date(r.submitted_date).toLocaleDateString()}</td>
                <td><div className="row-actions">
                  <button className="btn small" onClick={() => openProcessing(r)}>Add to roster</button>
                  <button className="btn ghost small" onClick={() => dismiss(r.id)}>Dismiss</button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
      {processing && (
        <Modal title="Add to roster" onClose={() => setProcessing(null)} onSave={() => process(processing)} saving={busy} saveLabel={selectedMatchId !== 'new' ? 'Enroll in existing record' : 'Create records'}>
          {!matchesLoaded ? (
            <p style={{ fontSize: 14, color: 'var(--ink-soft)' }}>Checking for an existing match…</p>
          ) : (
            <>
              {processing.is_returning && matches.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <p style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 8 }}>Marked as a returning student — possible matches found:</p>
                  {matches.map((m) => (
                    <label key={m.student.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 8, marginBottom: 8, cursor: 'pointer', background: selectedMatchId === m.student.id ? 'var(--pine-soft, #e8f0ec)' : 'transparent' }}>
                      <input type="radio" name="match" checked={selectedMatchId === m.student.id} onChange={() => setSelectedMatchId(m.student.id)} style={{ marginTop: 3 }} />
                      <span style={{ fontSize: 14 }}>
                        <strong>{m.student.first_name} {m.student.last_name}</strong>
                        {m.family && <> — {m.family.parent_first_name} {m.family.parent_last_name}</>}
                        <br />
                        <span className={`pill ${m.confidence === 'high' ? 'enrolled' : 'waitlist'}`}>{m.confidence === 'high' ? 'High confidence' : 'Low confidence — name only'}</span>
                      </span>
                    </label>
                  ))}
                  <label style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 8, cursor: 'pointer', background: selectedMatchId === 'new' ? 'var(--pine-soft, #e8f0ec)' : 'transparent' }}>
                    <input type="radio" name="match" checked={selectedMatchId === 'new'} onChange={() => setSelectedMatchId('new')} />
                    <span style={{ fontSize: 14 }}>None of these — create a new student</span>
                  </label>
                </div>
              )}
              {processing.is_returning && matches.length === 0 && (
                <p style={{ fontSize: 13.5, color: 'var(--ink-soft)', marginBottom: 14 }}>Marked as returning, but no existing student with this name was found — this will create a new record.</p>
              )}
              <p style={{ fontSize: 14, color: 'var(--ink-soft)' }}>
                {selectedMatchId !== 'new'
                  ? <>This will enroll the <strong>existing</strong> student in {processing.interested_class ? <>every class matching "<strong>{processing.interested_class}</strong>."</> : 'the selected class(es).'} No new family or student record will be created — only blank fields (like a missing birthday or emergency contact) get filled in.</>
                  : <>This creates a new family and student from <strong>{processing.parent_name}</strong>'s registration{processing.interested_class ? <> and enrolls them in every class matching "<strong>{processing.interested_class}</strong>."</> : '.'} You can fine-tune details afterward on the Families and Students screens.</>}
              </p>
              <div style={{ background: 'var(--cream)', borderRadius: 8, padding: 12, fontSize: 13.5, marginTop: 4 }}>
                <div><strong>Dancer:</strong> {processing.student_name} {processing.student_birthday && `· born ${processing.student_birthday}`}</div>
                {processing.secondary_parent_name && <div><strong>2nd parent:</strong> {processing.secondary_parent_name} {processing.secondary_parent_phone}</div>}
                {processing.emergency_contact_name && <div><strong>Emergency contact:</strong> {processing.emergency_contact_name} ({processing.emergency_contact_relationship}) {processing.emergency_contact_phone}</div>}
                <div><strong>Parent meeting:</strong> {[processing.meeting_aug28 && 'Aug 28', processing.meeting_sep3 && 'Sep 3'].filter(Boolean).join(', ') || 'none selected'}</div>
                {processing.wants_donation && <div><strong>💛 Interested in a registration donation</strong> <span style={{ fontWeight: 400, color: 'var(--ink-soft)' }}>(checked the box at signup — this only means they clicked, not that a payment was completed)</span></div>}
              </div>
            </>
          )}
        </Modal>
      )}
    </>
  )
}

const BLANK_TEACHER = { name: '', email: '', phone: '', specialties: '', notes: '' }
function Teachers() {
  const [rows, setRows] = useState(null)
  const [edit, setEdit] = useState(null)
  const [saving, setSaving] = useState(false)
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
  return (
    <>
      <div className="page-head">
        <div><h1>Teachers</h1><p>Your teaching team. Names entered here appear as suggestions when you set a class instructor.</p></div>
        <button className="btn" onClick={() => setEdit({ ...BLANK_TEACHER })}>Add teacher</button>
      </div>
      {rows.length === 0 ? (
        <div className="card"><div className="empty"><h3>No teachers yet</h3><p>Add your teaching team to keep their contact info in one place.</p><button className="btn" onClick={() => setEdit({ ...BLANK_TEACHER })}>Add teacher</button></div></div>
      ) : (
        <div className="table-wrap"><table>
          <thead><tr><th>Name</th><th>Teaches</th><th>Contact</th><th></th></tr></thead>
          <tbody>
            {rows.map((t) => (
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

  useEffect(() => {
    (async () => {
      let q = supabase.from('classes').select('id, name, day_of_week').eq('active', true).order('name')
      if (myTeacherId) q = q.eq('teacher_id', myTeacherId)
      const { data } = await q
      setClasses(data || [])
    })()
  }, [myTeacherId])

  const loadRoster = useCallback(async () => {
    if (!classId || !date) { setRoster(null); return }
    const { data: enr } = await supabase.from('enrollments').select('id, students(first_name, last_name)').eq('class_id', classId).eq('status', 'enrolled')
    const ids = (enr || []).map((e) => e.id)
    const existing = {}
    if (ids.length) {
      const { data: att } = await supabase.from('attendance').select('enrollment_id, present, status').eq('class_date', date).in('enrollment_id', ids)
      for (const a of att || []) existing[a.enrollment_id] = a.status || (a.present ? 'present' : 'absent')
    }
    setRoster((enr || []).map((e) => ({
      enrollment_id: e.id,
      name: e.students ? `${e.students.first_name} ${e.students.last_name}` : '—',
      status: existing[e.id] ?? '',
    })))
  }, [classId, date])
  useEffect(() => { loadRoster() }, [loadRoster])

  // Tap cycles: unmarked → present → tardy → absent → unmarked
  const NEXT = { '': 'present', present: 'tardy', tardy: 'absent', absent: '' }
  function toggle(id) { setRoster(roster.map((r) => r.enrollment_id === id ? { ...r, status: NEXT[r.status] } : r)) }

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
  }

  const presentCount = roster ? roster.filter((r) => r.status === 'present' || r.status === 'tardy').length : 0
  const statusLabel = { present: '✓ Present', tardy: 'T Tardy', absent: '○ Absent', '': 'Tap to mark' }
  const statusPill = { present: 'enrolled', tardy: 'waitlist', absent: 'dropped', '': 'inactive' }
  return (
    <>
      <div className="page-head"><div><h1>Attendance</h1><p>Pick a class and a date, check off who's here, save.</p></div></div>
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
]
// Families, Registrations, and Volunteer Inquiries are never offered here —
// they're blocked for teacher logins at the DATABASE level (see migration-9),
// so granting them in this screen would do nothing but show empty tables.

function TeacherAccess() {
  const [rows, setRows] = useState(null)
  const [teachers, setTeachers] = useState([])
  const [edit, setEdit] = useState(null)
  const [saving, setSaving] = useState(false)
  const load = useCallback(async () => {
    const [sr, t] = await Promise.all([
      supabase.from('staff_roles').select('*, teachers(name)').order('created_at'),
      supabase.from('teachers').select('id, name').order('name'),
    ])
    setRows(sr.data || []); setTeachers(t.data || [])
  }, [])
  useEffect(() => { load() }, [load])

  async function save() {
    setSaving(true)
    const payload = { role: edit.role, teacher_id: edit.teacher_id || null, allowed_screens: edit.allowed_screens, display_name: edit.display_name || null, email: edit.email || null }
    if (edit.isNew) await supabase.from('staff_roles').insert({ user_id: edit.user_id, ...payload })
    else await supabase.from('staff_roles').update(payload).eq('user_id', edit.user_id)
    setSaving(false); setEdit(null); load()
  }
  async function remove(userId) {
    await supabase.from('staff_roles').delete().eq('user_id', userId); load()
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
        <Modal title={edit.isNew ? 'Add teacher login' : 'Edit access'} onClose={() => setEdit(null)} onSave={save} saving={saving}>
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
    setRunning(false)
    setResult(`Copied ${payload.length} class${payload.length !== 1 ? 'es' : ''} into ${targetSeason}. Students were NOT auto-enrolled — re-enroll returning students in the new season's classes via Enrollments.`)
    load()
  }

  if (!classes) return <div className="loading">Loading…</div>
  return (
    <>
      <div className="page-head"><div><h1>New Season Rollover</h1><p>Copy last season's classes forward instead of re-entering them by hand each year.</p></div></div>
      <div className="card card-pad" style={{ marginBottom: 20 }}>
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

function Volunteers() {
  const [rows, setRows] = useState(null)
  const load = useCallback(async () => {
    const { data } = await supabase.from('volunteer_inquiries').select('*').eq('processed', false).order('submitted_date', { ascending: false })
    setRows(data || [])
  }, [])
  useEffect(() => { load() }, [load])
  async function markDone(id) { await supabase.from('volunteer_inquiries').update({ processed: true }).eq('id', id); load() }
  if (!rows) return <div className="loading">Loading…</div>
  return (
    <>
      <div className="page-head"><div><h1>Volunteer Inquiries</h1><p>People who offered to help through the website's "Volunteer with us" button.</p></div></div>
      {rows.length === 0 ? (
        <div className="card"><div className="empty"><h3>No new inquiries</h3><p>Volunteer offers from the website show up here.</p></div></div>
      ) : (
        <div className="table-wrap"><table>
          <thead><tr><th>Name</th><th>Contact</th><th>How they'd help</th><th>When</th><th></th></tr></thead>
          <tbody>{rows.map((v) => (
            <tr key={v.id}>
              <td data-label="Name"><strong>{v.name}</strong></td>
              <td data-label="Contact">{v.email || '—'}<br /><span style={{ color: 'var(--ink-soft)', fontSize: 13 }}>{v.phone}</span></td>
              <td data-label="How they'd help">{v.message || '—'}</td>
              <td data-label="When">{new Date(v.submitted_date).toLocaleDateString()}</td>
              <td><div className="row-actions"><button className="btn ghost small" onClick={() => markDone(v.id)}>Mark handled</button></div></td>
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
  { key: 'privacy', label: 'Privacy Settings' },
  { key: 'season', label: 'New Season' },
  { key: 'registrations', label: 'Registrations' },
  { key: 'volunteers', label: 'Volunteers' },
]

// Hard safelist: no matter what Corrie checks in Teacher Access, a teacher
// login can NEVER see anything outside this list. This is enforced here in
// code, not just as a UI suggestion — it's the backstop if a bad value ever
// ends up in the database.
const TEACHER_MAX_GRANTABLE = ['attendance', 'my-classes', 'classes', 'enrollments', 'students', 'rooms', 'teachers', 'photos', 'team', 'testimonials', 'announcements']

export default function App() {
  const [session, setSession] = useState(undefined)
  const [page, setPage] = useState('dashboard')
  const [newRegCount, setNewRegCount] = useState(0)
  const [isTeacher, setIsTeacher] = useState(false)
  const [myTeacherId, setMyTeacherId] = useState(null)
  const [allowedScreens, setAllowedScreens] = useState([])
  const [roleLoaded, setRoleLoaded] = useState(false)
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
    const { count } = await supabase.from('registrations').select('id', { count: 'exact', head: true }).eq('processed', false)
    setNewRegCount(count ?? 0)
  }, [isTeacher])
  useEffect(() => { if (session && roleLoaded) refreshRegCount() }, [session, page, roleLoaded, refreshRegCount])
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
        {safePage === 'enrollments' && <Enrollments />}
        {safePage === 'attendance' && <Attendance myTeacherId={isTeacher ? myTeacherId : null} />}
        {safePage === 'my-classes' && <MyClasses myTeacherId={myTeacherId} />}
        {safePage === 'classes' && <Classes />}
        {safePage === 'students' && <Students />}
        {safePage === 'families' && !isTeacher && <Families />}
        {safePage === 'teachers' && <Teachers />}
        {safePage === 'photos' && <Photos />}
        {safePage === 'team' && <Team />}
        {safePage === 'testimonials' && <Testimonials />}
        {safePage === 'announcements' && <Announcements />}
        {safePage === 'privacy' && !isTeacher && <PrivacySettings />}
        {safePage === 'season' && !isTeacher && <SeasonRollover />}
        {safePage === 'rooms' && <Rooms />}
        {safePage === 'registrations' && !isTeacher && <Registrations onProcessed={refreshRegCount} />}
        {safePage === 'volunteers' && !isTeacher && <Volunteers />}
        {safePage === 'teacher-access' && !isTeacher && <TeacherAccess />}
      </main>
    </div>
  )
}
