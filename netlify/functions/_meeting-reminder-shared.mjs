// Shine — shared logic between the real scheduled reminder function and
// the admin-triggered test/preview function. Deliberately factored out
// so the two paths use byte-identical rendering — a test that used
// slightly different logic than the real thing wouldn't actually prove
// anything about what real parents receive.
//
// The underscore prefix on this filename is a convention meaning "not a
// deployable function itself" — Netlify only treats files that export a
// `handler` as functions; this one exports plain helpers instead.

export function pacificDateString(offsetDays = 0) {
  const now = new Date(Date.now() + offsetDays * 86400000)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

export function pacificHour() {
  const h = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', hour12: false }).format(new Date()))
  return h === 24 ? 0 : h
}

export function currentGreeting() {
  return pacificHour() < 12 ? 'Good morning' : 'Good evening'
}

export const DEFAULT_TEMPLATE = 'Hi {{parent_name}},\n\n{{greeting}}! This is a reminder that {{student_name}}\'s Shine parent meeting is tomorrow: {{meeting_details}}, at Granada Heights Friends Church.\n\nGrace and Peace,\nCorrie Villa'

// The exact same substitution used for every real send. Takes whatever
// template is currently saved in Site Content (or the default, if none
// has been saved yet) and fills in the four supported tags.
export function renderReminder(template, { greeting, parentName, studentName, meetingDetails }) {
  return (template || DEFAULT_TEMPLATE)
    .replaceAll('{{greeting}}', greeting)
    .replaceAll('{{parent_name}}', parentName || 'there')
    .replaceAll('{{student_name}}', studentName || 'your dancer')
    .replaceAll('{{meeting_details}}', meetingDetails || 'tomorrow\'s meeting')
}

export const REMINDER_SUBJECT = 'Reminder: Shine parent meeting tomorrow'
