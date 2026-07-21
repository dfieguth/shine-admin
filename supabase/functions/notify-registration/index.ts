// Emails Corrie when a new registration lands — sent through Shine's own
// Gmail account (shineGHFC@gmail.com), not a third-party sending domain.
// No DNS setup needed. Requires two secrets: GMAIL_ADDRESS, GMAIL_APP_PASSWORD.
// (App password = a 16-character code generated inside Gmail's own security
// settings for exactly this purpose. See EMAIL-SETUP.md.)

import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts"

Deno.serve(async (req) => {
  try {
    const payload = await req.json()
    const r = payload.record
    if (!r) return new Response('no record', { status: 400 })

    const gmailAddress = Deno.env.get('GMAIL_ADDRESS')
    const gmailAppPassword = Deno.env.get('GMAIL_APP_PASSWORD')
    const notifyTo = Deno.env.get('NOTIFY_EMAIL') ?? gmailAddress

    const client = new SMTPClient({
      connection: {
        hostname: 'smtp.gmail.com',
        port: 465,
        tls: true,
        auth: { username: gmailAddress, password: gmailAppPassword },
      },
    })

    await client.send({
      from: gmailAddress,
      to: notifyTo,
      subject: `New Shine registration: ${r.student_name}`,
      content: [
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
    })
    await client.close()

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' }, status: 200,
    })
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500 })
  }
})
