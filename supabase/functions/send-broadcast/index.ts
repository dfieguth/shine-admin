// Sends a class broadcast email, BCC'd to parents so addresses stay private.
// Called from the admin tool (Enrollments → Email class → "Send from Shine").
// IMPORTANT: deploy with "Verify JWT" ON — only logged-in staff may call this.
// Requires secrets: RESEND_API_KEY, FROM_EMAIL (verified ghfc.org sender),
// and optionally NOTIFY_EMAIL (the visible To: address; defaults to Shine).

Deno.serve(async (req) => {
  try {
    const { subject, message, emails } = await req.json()
    if (!subject || !message || !Array.isArray(emails) || emails.length === 0) {
      return new Response(JSON.stringify({ ok: false, error: 'missing fields' }), { status: 400 })
    }
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
      },
      body: JSON.stringify({
        from: Deno.env.get('FROM_EMAIL') ?? 'Shine Dance Studio <onboarding@resend.dev>',
        to: [Deno.env.get('NOTIFY_EMAIL') ?? 'shineGHFC@gmail.com'],
        bcc: emails,
        subject,
        text: message,
      }),
    })
    const body = await res.text()
    return new Response(JSON.stringify({ ok: res.ok, detail: res.ok ? undefined : body }), {
      headers: { 'Content-Type': 'application/json' },
      status: res.ok ? 200 : 500,
    })
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500 })
  }
})
