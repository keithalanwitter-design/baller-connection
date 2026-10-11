/** Pluggable email delivery. Pick with EMAIL_PROVIDER = log | resend | postmark (EMAIL_API_KEY secret, EMAIL_FROM var). */
export interface EmailMessage { to: string; subject: string; body: string }
export interface EmailProvider { readonly name: string; send(m: EmailMessage): Promise<'sent' | 'logged'> }
export class LogProvider implements EmailProvider { readonly name = 'log'; async send() { return 'logged' as const; } }
export class ResendProvider implements EmailProvider {
  readonly name = 'resend'; private key: string; private from: string; constructor(key: string, from: string) { this.key = key; this.from = from; }
  async send(m: EmailMessage) { const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { authorization: `Bearer ${this.key}`, 'content-type': 'application/json' }, body: JSON.stringify({ from: this.from, to: m.to, subject: m.subject, text: m.body }) }); if (!r.ok) throw new Error(`Resend ${r.status}`); return 'sent' as const; }
}
export class PostmarkProvider implements EmailProvider {
  readonly name = 'postmark'; private key: string; private from: string; constructor(key: string, from: string) { this.key = key; this.from = from; }
  async send(m: EmailMessage) { const r = await fetch('https://api.postmarkapp.com/email', { method: 'POST', headers: { 'X-Postmark-Server-Token': this.key, 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ From: this.from, To: m.to, Subject: m.subject, TextBody: m.body }) }); if (!r.ok) throw new Error(`Postmark ${r.status}`); return 'sent' as const; }
}
export function makeProvider(env: { EMAIL_PROVIDER?: string; EMAIL_API_KEY?: string; EMAIL_FROM?: string }): EmailProvider {
  const from = env.EMAIL_FROM ?? 'Baller Connection <coach@example.com>';
  if (env.EMAIL_PROVIDER === 'resend' && env.EMAIL_API_KEY) return new ResendProvider(env.EMAIL_API_KEY, from);
  if (env.EMAIL_PROVIDER === 'postmark' && env.EMAIL_API_KEY) return new PostmarkProvider(env.EMAIL_API_KEY, from);
  return new LogProvider();
}
