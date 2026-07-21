// Sends a class broadcast email, BCC'd to parents, through Shine's own
// Gmail account. No DNS, no third-party sending domain.
// IMPORTANT: deploy with "Verify JWT" ON — only logged-in staff may call this.
// Requires secrets: GMAIL_ADDRESS, GMAIL_APP_PASSWORD.

import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts"

Deno.serve(async (req) => {
  try {
    const { subject, message, emails } = await req.json()
    if (!subject || !message || !Array.isArray(emails) || emails.length === 0) {
      return new Response(JSON.stringify({ ok: false, error: 'missing fields' }), { status: 400 })
    }

    const gmailAddress = Deno.env.get('GMAIL_ADDRESS')
    const gmailAppPassword = Deno.env.get('GMAIL_APP_PASSWORD')

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
      to: gmailAddress,       // visible "To" stays Shine's own address
      bcc: emails,            // parents are BCC'd, never see each other
      subject,
      content: message,
    })
    await client.close()

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' }, status: 200,
    })
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500 })
  }
})
