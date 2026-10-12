/**
 * Pluggable email delivery. EMAIL_PROVIDER = log (default) | resend | postmark.
 * Secrets: RESEND_API_KEY or POSTMARK_SERVER_TOKEN (EMAIL_API_KEY still works for either). EMAIL_FROM is a plain var.
 * Without a key the Log provider is used: mail is stored in the staff outbox and nothing leaves the server.
 */
export interface EmailMessage { to: string; subject: string; body: string; html?: string | null; headers?: Record<string, string> }
export interface EmailProvider { readonly name: string; send(m: EmailMessage): Promise<'sent' | 'logged'> }
export class LogProvider implements EmailProvider { readonly name = 'log'; async send() { return 'logged' as const; } }
/** Provider errors carry the HTTP status so delivery can tell "retry later" from "this will never work". */
export class ProviderError extends Error { status: number; constructor(name: string, status: number, detail: string) { super(`${name} ${status}${detail ? `: ${detail.slice(0, 160)}` : ''}`); this.status = status; } }
type Fetch = typeof fetch;
export class ResendProvider implements EmailProvider {
  readonly name = 'resend'; constructor(private key: string, private from: string, private f: Fetch = fetch) {}
  async send(m: EmailMessage) {
    const r = await this.f('https://api.resend.com/emails', { method: 'POST', headers: { authorization: `Bearer ${this.key}`, 'content-type': 'application/json' }, body: JSON.stringify({ from: this.from, to: m.to, subject: m.subject, text: m.body, ...(m.html ? { html: m.html } : {}), ...(m.headers ? { headers: m.headers } : {}) }) });
    if (!r.ok) throw new ProviderError('Resend', r.status, await r.text().catch(() => '')); return 'sent' as const;
  }
}
export class PostmarkProvider implements EmailProvider {
  readonly name = 'postmark'; constructor(private key: string, private from: string, private f: Fetch = fetch) {}
  async send(m: EmailMessage) {
    const r = await this.f('https://api.postmarkapp.com/email', { method: 'POST', headers: { 'X-Postmark-Server-Token': this.key, 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ From: this.from, To: m.to, Subject: m.subject, TextBody: m.body, ...(m.html ? { HtmlBody: m.html } : {}), MessageStream: 'outbound', ...(m.headers ? { Headers: Object.entries(m.headers).map(([Name, Value]) => ({ Name, Value })) } : {}) }) });
    if (!r.ok) throw new ProviderError('Postmark', r.status, await r.text().catch(() => '')); return 'sent' as const;
  }
}
export interface EmailEnv { EMAIL_PROVIDER?: string; EMAIL_API_KEY?: string; RESEND_API_KEY?: string; POSTMARK_SERVER_TOKEN?: string; EMAIL_FROM?: string }
export function makeProvider(env: EmailEnv, f: Fetch = fetch): EmailProvider {
  const from = env.EMAIL_FROM ?? 'Baller Connection <coach@example.com>';
  const resend = env.RESEND_API_KEY ?? (env.EMAIL_PROVIDER === 'resend' ? env.EMAIL_API_KEY : undefined); const postmark = env.POSTMARK_SERVER_TOKEN ?? (env.EMAIL_PROVIDER === 'postmark' ? env.EMAIL_API_KEY : undefined);
  if (env.EMAIL_PROVIDER === 'resend' && resend) return new ResendProvider(resend, from, f);
  if (env.EMAIL_PROVIDER === 'postmark' && postmark) return new PostmarkProvider(postmark, from, f);
  return new LogProvider();
}
