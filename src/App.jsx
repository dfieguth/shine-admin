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

const BLANK_CLASS = { name: '', level: 'Beginner', day_of_week: 'Monday', start_time: '', end_time: '', location: '', capacity: '', instructor_name: '', active: true }
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const LEVELS = ['Beginner', 'Intermediate', 'Advanced', 'All levels']

function Classes() {
  const [rows, setRows] = useState(null)
  const [teachers, setTeachers] = useState([])
  const [edit, setEdit] = useState(null)
  const [saving, setSaving] = useState(false)
  const load = useCallback(async () => {
    const [c, t] = await Promise.all([
      supabase.from('classes').select('*').order('active', { ascending: false }).order('day_of_week'),
      supabase.from('teachers').select('id, name').order('name'),
    ])
    setRows(c.data || []); setTeachers(t.data || [])
  }, [])
  useEffect(() => { load() }, [load])
  async function save() {
    setSaving(true)
    const payload = { ...edit, capacity: edit.capacity === '' ? null : Number(edit.capacity) }
    if (edit.id) await supabase.from('classes').update(payload).eq('id', edit.id)
    else await supabase.from('classes').insert(payload)
    setSaving(false); setEdit(null); load()
  }
  async function toggleActive(c) { await supabase.from('classes').update({ active: !c.active }).eq('id', c.id); load() }
  if (!rows) return <div className="loading">Loading…</div>
  return (
    <>
      <div className="page-head">
        <div><h1>Classes</h1><p>Add, edit, or retire a class. Retired classes disappear from the public schedule.</p></div>
        <button className="btn" onClick={() => setEdit({ ...BLANK_CLASS })}>Add class</button>
      </div>
      {rows.length === 0 ? (
        <div className="card"><div className="empty"><h3>No classes yet</h3><p>Add your first class to start building the schedule.</p><button className="btn" onClick={() => setEdit({ ...BLANK_CLASS })}>Add class</button></div></div>
      ) : (
        <div className="table-wrap"><table>
          <thead><tr><th>Class</th><th>Level</th><th>When</th><th>Instructor</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td data-label="Class"><strong>{c.name}</strong><br /><span style={{ color: 'var(--ink-soft)', fontSize: 13 }}>{c.location}</span></td>
                <td data-label="Level">{c.level}</td>
                <td data-label="When">{c.day_of_week}<br /><span style={{ color: 'var(--ink-soft)', fontSize: 13 }}>{c.start_time}{c.end_time ? `–${c.end_time}` : ''}</span></td>
                <td data-label="Instructor">{c.instructor_name || '—'}</td>
                <td data-label="Status"><span className={`pill ${c.active ? 'enrolled' : 'inactive'}`}>{c.active ? 'Active' : 'Retired'}</span></td>
                <td><div className="row-actions">
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
          <Field label="Class name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="Tuesday Beginner Ballet" />
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
            <Field label="Instructor" list="teachers-dl" value={edit.instructor_name} onChange={(e) => setEdit({ ...edit, instructor_name: e.target.value })} placeholder="pick or type a name" />
            <Field label="Capacity" type="number" value={edit.capacity ?? ''} onChange={(e) => setEdit({ ...edit, capacity: e.target.value })} placeholder="optional" />
          </div>
          <datalist id="teachers-dl">{teachers.map((t) => <option key={t.id} value={t.name} />)}</datalist>
        </Modal>
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
  const load = useCallback(async () => {
    const [s, f] = await Promise.all([
      supabase.from('students').select('*, families(parent_first_name, parent_last_name)').order('last_name'),
      supabase.from('families').select('id, parent_first_name, parent_last_name').order('parent_last_name'),
    ])
    setRows(s.data || []); setFamilies(f.data || [])
  }, [])
  useEffect(() => { load() }, [load])
  async function save() {
    setSaving(true)
    const payload = { ...edit, family_id: edit.family_id || null }
    delete payload.families
    if (edit.id) await supabase.from('students').update(payload).eq('id', edit.id)
    else await supabase.from('students').insert(payload)
    setSaving(false); setEdit(null); load()
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
          <thead><tr><th>Student</th><th>Grade</th><th>Level</th><th>Family</th><th></th></tr></thead>
          <tbody>
            {filtered.map((s) => (
              <tr key={s.id}>
                <td data-label="Student"><strong>{s.first_name} {s.last_name}</strong></td>
                <td data-label="Grade">{s.grade || '—'}</td>
                <td data-label="Level">{s.level || '—'}</td>
                <td data-label="Family">{s.families ? `${s.families.parent_first_name} ${s.families.parent_last_name}` : '—'}</td>
                <td><div className="row-actions"><button className="btn ghost small" onClick={() => setEdit(s)}>Edit</button></div></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
      {edit && (
        <Modal title={edit.id ? 'Edit student' : 'Add student'} onClose={() => setEdit(null)} onSave={save} saving={saving}>
          <div className="field row2">
            <Field label="First name" value={edit.first_name} onChange={(e) => setEdit({ ...edit, first_name: e.target.value })} />
            <Field label="Last name" value={edit.last_name} onChange={(e) => setEdit({ ...edit, last_name: e.target.value })} />
          </div>
          <div className="field row2">
            <Field label="Grade" value={edit.grade || ''} onChange={(e) => setEdit({ ...edit, grade: e.target.value })} placeholder="e.g. 4th" />
            <Field label="Level" value={edit.level} options={LEVELS} onChange={(e) => setEdit({ ...edit, level: e.target.value })} />
          </div>
          <Field label="Family" value={edit.family_id || ''} options={famOptions} onChange={(e) => setEdit({ ...edit, family_id: e.target.value })} />
          <Field label="Medical / allergies (staff only)" textarea value={edit.medical_notes || ''} onChange={(e) => setEdit({ ...edit, medical_notes: e.target.value })} placeholder="Allergies, conditions, medications leaders should know about" />
          <Field label="Notes" textarea value={edit.notes || ''} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} />
        </Modal>
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
      supabase.from('enrollments').select('*, students(first_name, last_name), classes(name, day_of_week)').order('created_at', { ascending: false }),
      supabase.from('students').select('id, first_name, last_name').order('last_name'),
      supabase.from('classes').select('id, name, capacity').eq('active', true).order('name'),
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
        <div className="spacer" />
        <span style={{ color: 'var(--ink-soft)', fontSize: 13 }}>{filtered.length} enrollment{filtered.length !== 1 ? 's' : ''}</span>
      </div>
      {filtered.length === 0 ? (
        <div className="card"><div className="empty"><h3>No enrollments here</h3><p>Enroll a student to get started.</p></div></div>
      ) : (
        <div className="table-wrap"><table>
          <thead><tr><th>Student</th><th>Class</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id}>
                <td data-label="Student"><strong>{r.students ? `${r.students.first_name} ${r.students.last_name}` : '—'}</strong></td>
                <td data-label="Class">{r.classes ? r.classes.name : '—'}<br /><span style={{ color: 'var(--ink-soft)', fontSize: 13 }}>{r.classes?.day_of_week}</span></td>
                <td data-label="Status"><span className={`pill ${r.status}`}>{r.status}</span></td>
                <td><div className="row-actions">
                  {r.status !== 'enrolled' && <button className="btn ghost small" onClick={() => setStatus(r.id, 'enrolled')}>Enroll</button>}
                  {r.status !== 'waitlist' && <button className="btn ghost small" onClick={() => setStatus(r.id, 'waitlist')}>Waitlist</button>}
                  {r.status !== 'dropped' && <button className="btn ghost small" onClick={() => setStatus(r.id, 'dropped')}>Drop</button>}
                  <button className="btn danger small" onClick={() => remove(r.id)}>Remove</button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table></div>
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

function Registrations({ onProcessed }) {
  const [rows, setRows] = useState(null)
  const [processing, setProcessing] = useState(null)
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    const { data } = await supabase.from('registrations').select('*').eq('processed', false).order('submitted_date', { ascending: false })
    setRows(data || [])
  }, [])
  useEffect(() => { load() }, [load])
  async function process(r) {
    setBusy(true)
    const [firstName, ...rest] = (r.parent_name || '').trim().split(' ')
    const { data: fam } = await supabase.from('families').insert({
      parent_first_name: firstName || r.parent_name, parent_last_name: rest.join(' ') || '', email: r.email, phone: r.phone,
    }).select().single()
    const [sFirst, ...sRest] = (r.student_name || '').trim().split(' ')
    const { data: stu } = await supabase.from('students').insert({
      first_name: sFirst || r.student_name, last_name: sRest.join(' ') || '', grade: r.student_grade, family_id: fam?.id || null,
    }).select().single()
    if (r.interested_class && stu) {
      const { data: cls } = await supabase.from('classes').select('id, name, capacity').eq('active', true)
      const match = (cls || []).find((c) => r.interested_class.toLowerCase().includes(c.name.toLowerCase()))
      if (match) {
        let status = 'enrolled'
        if (match.capacity) {
          const { count } = await supabase.from('enrollments').select('id', { count: 'exact', head: true }).eq('class_id', match.id).eq('status', 'enrolled')
          if ((count ?? 0) >= match.capacity) status = 'waitlist'
        }
        await supabase.from('enrollments').insert({ student_id: stu.id, class_id: match.id, status })
      }
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
          <thead><tr><th>Parent</th><th>Student</th><th>Interest</th><th>Submitted</th><th></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td data-label="Parent"><strong>{r.parent_name}</strong><br /><span style={{ color: 'var(--ink-soft)', fontSize: 13 }}>{r.email} {r.phone}</span></td>
                <td data-label="Student">{r.student_name}<br /><span style={{ color: 'var(--ink-soft)', fontSize: 13 }}>{r.student_grade}</span></td>
                <td data-label="Interest">{r.interested_class || '—'}</td>
                <td data-label="Submitted">{new Date(r.submitted_date).toLocaleDateString()}</td>
                <td><div className="row-actions">
                  <button className="btn small" onClick={() => setProcessing(r)}>Add to roster</button>
                  <button className="btn ghost small" onClick={() => dismiss(r.id)}>Dismiss</button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
      {processing && (
        <Modal title="Add to roster" onClose={() => setProcessing(null)} onSave={() => process(processing)} saving={busy} saveLabel="Create records">
          <p style={{ fontSize: 14, color: 'var(--ink-soft)' }}>
            This creates a family and a student from <strong>{processing.parent_name}</strong>'s registration
            {processing.interested_class ? <> and tries to enroll them in a class matching "<strong>{processing.interested_class}</strong>."</> : '.'}
            {' '}You can fine-tune the details afterward on the Families and Students screens.
          </p>
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

function Attendance() {
  const [classes, setClasses] = useState([])
  const [classId, setClassId] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [roster, setRoster] = useState(null)
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState('')

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('classes').select('id, name, day_of_week').eq('active', true).order('name')
      setClasses(data || [])
    })()
  }, [])

  const loadRoster = useCallback(async () => {
    if (!classId || !date) { setRoster(null); return }
    const { data: enr } = await supabase.from('enrollments').select('id, students(first_name, last_name)').eq('class_id', classId).eq('status', 'enrolled')
    const ids = (enr || []).map((e) => e.id)
    const existing = {}
    if (ids.length) {
      const { data: att } = await supabase.from('attendance').select('enrollment_id, present').eq('class_date', date).in('enrollment_id', ids)
      for (const a of att || []) existing[a.enrollment_id] = a.present
    }
    setRoster((enr || []).map((e) => ({
      enrollment_id: e.id,
      name: e.students ? `${e.students.first_name} ${e.students.last_name}` : '—',
      present: existing[e.id] ?? false,
    })))
  }, [classId, date])
  useEffect(() => { loadRoster() }, [loadRoster])

  function toggle(id) { setRoster(roster.map((r) => r.enrollment_id === id ? { ...r, present: !r.present } : r)) }

  async function save() {
    setSaving(true)
    const ids = roster.map((r) => r.enrollment_id)
    await supabase.from('attendance').delete().eq('class_date', date).in('enrollment_id', ids)
    await supabase.from('attendance').insert(roster.map((r) => ({ enrollment_id: r.enrollment_id, class_date: date, present: r.present })))
    setSaving(false); setSavedMsg('Saved ✓'); setTimeout(() => setSavedMsg(''), 2500)
  }

  const presentCount = roster ? roster.filter((r) => r.present).length : 0
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
            <thead><tr><th>Student</th><th>Present</th></tr></thead>
            <tbody>
              {roster.map((r) => (
                <tr key={r.enrollment_id} onClick={() => toggle(r.enrollment_id)} style={{ cursor: 'pointer' }}>
                  <td data-label="Student"><strong>{r.name}</strong></td>
                  <td data-label="Present"><input type="checkbox" checked={r.present} onChange={() => toggle(r.enrollment_id)} onClick={(e) => e.stopPropagation()} /></td>
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

const NAV = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'enrollments', label: 'Enrollments' },
  { key: 'attendance', label: 'Attendance' },
  { key: 'classes', label: 'Classes' },
  { key: 'students', label: 'Students' },
  { key: 'families', label: 'Families' },
  { key: 'teachers', label: 'Teachers' },
  { key: 'photos', label: 'Photos' },
  { key: 'announcements', label: 'Announcements' },
  { key: 'registrations', label: 'Registrations' },
]

export default function App() {
  const [session, setSession] = useState(undefined)
  const [page, setPage] = useState('dashboard')
  const [newRegCount, setNewRegCount] = useState(0)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])
  const refreshRegCount = useCallback(async () => {
    const { count } = await supabase.from('registrations').select('id', { count: 'exact', head: true }).eq('processed', false)
    setNewRegCount(count ?? 0)
  }, [])
  useEffect(() => { if (session) refreshRegCount() }, [session, page, refreshRegCount])
  if (session === undefined) return <div className="loading">Loading…</div>
  if (!session) return <AuthScreen />
  return (
    <div className="app">
      <nav className="sidebar">
        <div className="brand">Shine<small>Dance Studio</small></div>
        {NAV.map((n) => (
          <button key={n.key} className={`navlink ${page === n.key ? 'active' : ''}`} onClick={() => setPage(n.key)}>
            {n.label}
            {n.key === 'registrations' && newRegCount > 0 && <span className="badge">{newRegCount}</span>}
          </button>
        ))}
        <button className="navlink signout" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </nav>
      <main className="main">
        {page === 'dashboard' && <Dashboard go={setPage} />}
        {page === 'enrollments' && <Enrollments />}
        {page === 'attendance' && <Attendance />}
        {page === 'classes' && <Classes />}
        {page === 'students' && <Students />}
        {page === 'families' && <Families />}
        {page === 'teachers' && <Teachers />}
        {page === 'photos' && <Photos />}
        {page === 'announcements' && <Announcements />}
        {page === 'registrations' && <Registrations onProcessed={refreshRegCount} />}
      </main>
    </div>
  )
}
