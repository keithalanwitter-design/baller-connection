// Sends ONE test email through Resend so you can confirm the key and domain work.
// Usage: RESEND_API_KEY=re_... EMAIL_FROM="Baller Connection <coach@yourdomain.com>" npm run email:test -- you@yourdomain.com
import { ResendProvider } from '../server/email';
import { render } from '../shared/emails';
const key = process.env.RESEND_API_KEY; const from = process.env.EMAIL_FROM; const to = process.argv[2] ?? process.env.EMAIL_TEST_TO;
if (!key || !from || !to) {
  console.log('Nothing sent. Needs:\n  RESEND_API_KEY   (Resend → API Keys, "Sending access")\n  EMAIL_FROM       (an address on your verified domain, e.g. "Baller Connection <coach@yourdomain.com>")\n  a recipient      (npm run email:test -- you@yourdomain.com)');
  process.exit(1);
}
const r = render('magic-link', { name: 'there', token: 'test-only-not-a-real-link' });
const msg = { to, subject: '[Test] Baller Connection email is working', body: `This is a test from npm run email:test.\n\nIf you can read this, Resend, your API key and your sending domain are set up.\n\nBelow is how a sign-in email looks (the link in it is not real):\n\n${r.text}`, html: r.html };
try { await new ResendProvider(key, from).send(msg); console.log(`Sent to ${to} from ${from}. Check the inbox (and spam) and Resend → Emails for the delivery log.`); }
catch (e) { console.error(`Resend refused it: ${(e as Error).message}\nCommon causes: the key lacks sending access, or EMAIL_FROM isn't on a verified domain.`); process.exit(1); }
