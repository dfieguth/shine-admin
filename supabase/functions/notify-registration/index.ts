// Emails Corrie when a new registration lands.
// Triggered by a Supabase Database Webhook on INSERT into `registrations`.
// Requires secrets: RESEND_API_KEY, and optionally NOTIFY_EMAIL / FROM_EMAIL.

Deno.serve(async (req) => {
  try {
    const payload = await req.json()
    const r = payload.record
    if (!r) return new Response('no record', { status: 400 })

    const to = Deno.env.get('NOTIFY_EMAIL') ?? 'shineGHFC@gmail.com'
    const from = Deno.env.get('FROM_EMAIL') ?? 'Shine Registrations <onboarding@resend.dev>'

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: `New Shine registration: ${r.student_name}`,
        text: [
          `A new registration just came in on the Shine website.`,
          ``,
          `Parent: ${r.parent_name}`,
          `Email: ${r.email ?? '—'}`,
          `Phone: ${r.phone ?? '—'}`,
          `Dancer: ${r.student_name} (${r.student_grade ?? 'grade not given'})`,
          `Class of interest: ${r.interested_class ?? '—'}`,
          ``,
          `Open the admin tool → Registrations to add them to the roster.`,
        ].join('\n'),
      }),
    })
    return new Response(JSON.stringify({ ok: res.ok }), {
      headers: { 'Content-Type': 'application/json' },
      status: res.ok ? 200 : 500,
    })
  } catch (e) {
    return new Response(String(e), { status: 500 })
  }
})
