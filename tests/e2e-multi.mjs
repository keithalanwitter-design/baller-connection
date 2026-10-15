// Multi-user e2e against the local backend (Node + SQLite adapter, same handler as the Worker).
// Each persona is its own browser context with its own httpOnly session cookie.
// Run: npm run serve:local (PORT=8799) then BASE=http://localhost:8799/baller-connection/ node tests/e2e-multi.mjs
import { chromium } from 'playwright';
const B = process.env.BASE || 'http://localhost:8799/baller-connection/'; const API = new URL(B).origin;
const b = await chromium.launch({ executablePath: process.env.CHROME }); const errs = [];
const ok = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('  ✓', m); };
async function persona(name, w = 1280) {
  const ctx = await b.newContext({ viewport: { width: w, height: 880 } }); const pg = await ctx.newPage();
  pg.on('pageerror', (e) => errs.push(`${name}: ${e.message}`)); pg.on('dialog', (d) => d.accept());
  const go = async (h) => { await pg.goto(B + '#' + h); await pg.waitForTimeout(450); };
  const shot = (n, full = true) => pg.screenshot({ path: `shots/${n}.png`, fullPage: full });
  const gotIt = async () => { await pg.waitForTimeout(250); const g = pg.locator('.moment button', { hasText: /^(OK|Got it)$/ }); if (await g.count()) await g.first().click(); };
  const api = (path) => pg.evaluate((p) => fetch(p, { credentials: 'include' }).then((r) => r.json()), path);
  const login = async (id, secret, pin = false) => { await go('/login'); if (pin) await pg.getByRole('tab', { name: 'Player' }).click(); await pg.fill('#lg', id); await pg.fill('#pw', secret); await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForTimeout(700); };
  return { ctx, pg, go, shot, gotIt, api, login };
}
const cookies = async (p) => (await p.ctx.cookies(API)).find((c) => c.name === 'bc_session');

// 0 · Live build: no demo bar; app routes require sign-in
const visitor = await persona('visitor');
await visitor.go('/coach'); await visitor.pg.waitForURL(/#\/login/, { timeout: 15000 }); ok(/#\/login/.test(visitor.pg.url()), 'live mode: /coach redirects to sign-in'); ok(await visitor.pg.locator('.demobar').count() === 0, 'live mode: no demo bar');
await visitor.shot('20-login', false);
// 1 · Family applies publicly
await visitor.go('/apply'); await visitor.pg.fill('#pn', 'Kai Rook'); await visitor.pg.fill('#pp', 'Lou Rook'); await visitor.pg.fill('#pe', 'lou@family.test'); await visitor.pg.getByRole('button', { name: 'Continue' }).click();
for (const t of ['13–14', '3–4 days', 'Both of us', 'Plan + regular feedback']) { await visitor.pg.getByRole('radio', { name: t }).click(); await visitor.pg.waitForTimeout(220); }
await visitor.pg.fill('#t', 'Finish with my left hand'); await visitor.pg.getByRole('button', { name: 'Continue' }).click(); await visitor.pg.fill('#t', 'Finish through contact with my left'); await visitor.pg.getByRole('button', { name: 'See my result' }).click();
await visitor.pg.getByRole('button', { name: 'Submit application' }).click(); await visitor.pg.getByText('Application in').waitFor(); ok(true, 'public application submitted');

// 2 · Ops: queue → assign assistant → invite
const ops = await persona('ops'); await ops.login('ops@demo.test', 'demo-pass-123');
ok(/#\/ops/.test(ops.pg.url()), 'ops lands on the Ops queue'); const oc = await cookies(ops); ok(oc?.httpOnly && oc.sameSite === 'Lax', 'session cookie is httpOnly + SameSite=Lax');
ok(await ops.pg.locator('.qrow', { hasText: 'Kai Rook' }).filter({ hasText: 'New application' }).count() === 1, 'ops queue: Kai is a New application');
ok(await ops.pg.locator('.qrow', { hasText: 'Sam Quill' }).filter({ hasText: 'Payment' }).count() === 1, 'ops queue: unpaid billing item');
await ops.shot('21-ops-queue');
await ops.pg.locator('.qrow', { hasText: 'Kai Rook' }).click(); await ops.pg.waitForTimeout(400);
await ops.pg.getByLabel('Assigned coach').selectOption('u_asst'); await ops.pg.waitForTimeout(400);
await ops.pg.getByRole('button', { name: 'Send invite' }).click(); await ops.gotIt(); await ops.pg.waitForTimeout(400);
const out = await ops.api('/api/outbox'); const inviteMail = out.find((m) => m.to === 'lou@family.test' && m.kind === 'invite'); ok(inviteMail && inviteMail.status === 'logged', 'invite email went through the provider (dev log)');
const token = inviteMail.body.match(/token=([a-f0-9]+)/)[1]; const code = inviteMail.body.match(/code (\d{6})/)[1]; ok(token.length === 48 && code.length === 6, 'invite has a tokenized link + 6-digit backup code');
await ops.go('/ops/outbox'); await ops.pg.locator('.mailrow').first().click(); await ops.shot('22-outbox', false);

// 3 · Parent accepts via link, creates account, onboarding + consent, sets player PIN
const parent = await persona('parent', 1100); await parent.go(`/invite?token=${token}`);
await parent.pg.fill('#ipn', 'Lou Rook'); await parent.pg.fill('#ie', 'lou@family.test'); await parent.pg.fill('#ipw', 'kai-is-great-1'); await parent.shot('23-invite-accept', false);
await parent.pg.getByRole('button', { name: /Accept invite/ }).click(); await parent.pg.waitForURL(/welcome/); ok(!!(await cookies(parent)), 'parent account created + signed in');
await parent.pg.getByRole('button', { name: 'Continue to secure checkout' }).click(); await parent.pg.waitForURL(/#\/checkout/); await parent.pg.getByRole('button', { name: /Subscribe/ }).click(); await parent.pg.waitForURL(/#\/welcome.*paid=1/); await parent.pg.getByText('Meet ').first().waitFor();
ok((await parent.api('/api/snapshot')).snapshot.players.find((p) => p.name === 'Kai Rook').billing === 'paid', 'live: invite → checkout (simulated, signed webhook events) → paid → onboarding');
ok(/How I work/.test(await parent.pg.locator('.meetcoach').innerText()), 'live: onboarding starts with meet-your-coach'); await parent.pg.getByRole('button', { name: 'Continue' }).click();
await parent.pg.getByRole('radio', { name: 'Wing' }).click(); await parent.pg.getByRole('button', { name: 'Continue' }).click();
await parent.pg.fill('#g', 'Finish with my left hand'); await parent.pg.getByRole('button', { name: 'Continue' }).click();
await parent.pg.getByRole('radio', { name: 'Watch, then try' }).click(); await parent.pg.getByRole('button', { name: 'Continue' }).click();
await parent.pg.getByRole('radiogroup', { name: 'Clips per week' }).getByRole('radio', { name: '2', exact: true }).click(); await parent.pg.getByRole('radiogroup', { name: 'Clip day' }).getByRole('radio', { name: 'Thu' }).click(); await parent.pg.getByRole('button', { name: 'Continue' }).click();
ok(await parent.pg.getByRole('button', { name: 'Continue' }).isDisabled(), 'live: the roles agreement must be ticked'); await parent.pg.getByRole('checkbox').check(); await parent.pg.getByRole('button', { name: 'Continue' }).click();
ok(await parent.pg.getByRole('button', { name: /Agree & finish/ }).isDisabled(), 'cannot finish without consent');
await parent.pg.fill('#gn', 'Lou Rook'); await parent.pg.getByRole('checkbox').check(); await parent.shot('24-consent', false);
await parent.pg.getByRole('button', { name: /Agree & finish/ }).click(); await parent.pg.getByText('Welcome, Kai.').waitFor(); ok(true, 'consent recorded → onboarding complete');
await parent.pg.getByLabel('Player username').fill('kai.rook'); await parent.pg.getByLabel('PIN').fill('4321'); await parent.pg.getByRole('button', { name: 'Save login' }).click(); await parent.pg.getByText(/can sign in as/).waitFor(); ok(true, 'parent issued player username + PIN');

// 4 · Assistant: Activation → Plan needed in *their* queue → publish from a template
const asst = await persona('assistant'); await asst.login('assistant@demo.test', 'demo-pass-123');
ok(await asst.pg.locator('.qrow', { hasText: 'Kai Rook' }).filter({ hasText: 'Plan needed' }).count() === 1, 'routed: Kai’s Plan needed is in the assistant’s queue');
ok(await asst.pg.locator('.qrow', { hasText: 'Avery Pine' }).count() === 0, 'routed: head coach’s players are not in the assistant queue');
await asst.go('/coach/library'); await asst.pg.fill('#dt', 'Mikan drill'); await asst.pg.getByLabel('Cue 1').fill('Soft touch off the glass'); await asst.pg.getByRole('button', { name: 'Add to library' }).click(); await asst.pg.waitForTimeout(400);
ok(await asst.pg.locator('.drill', { hasText: 'Mikan drill' }).count() === 1, 'coach adds a drill to the library');
await asst.go('/coach/plan/' + (await asst.api('/api/snapshot')).snapshot.players.find((p) => p.name === 'Kai Rook').id);
await asst.pg.getByRole('button', { name: /Weak-hand starter/ }).click(); await asst.pg.getByRole('button', { name: /Mikan drill/ }).click();
ok(await asst.pg.getByRole('button', { name: 'Send first look + plan' }).isDisabled(), 'live: no first plan without the coach’s own “what I saw”'); await asst.pg.fill('#saw', 'Strong left-hand touch around the rim. Going right, your eyes drop.'); await asst.pg.getByRole('button', { name: 'Send first look + plan' }).click(); await asst.gotIt(); ok(true, 'assistant sent Kai’s first look + plan from a template + library drill');

// 5 · Player (PIN login, no email) unlocks rep 1 and submits with a link
const player = await persona('player', 430); await player.login('kai.rook', '4321', true); ok(/#\/app/.test(player.pg.url()), 'player signs in with username + PIN');
await player.pg.getByRole('button', { name: /Read my focus/ }).click(); await player.gotIt();
ok(/Strong left-hand touch/.test(await player.pg.locator('.firstlook').innerText()), 'live: the player reads what the coach saw'); ok(await player.pg.locator('#stuck-btn').isVisible(), 'live: “I’m stuck” on the phone-width player screen');
await player.pg.fill('#refl', 'Left hand felt better by set three.'); await player.pg.setInputFiles('#clipfile', 'tests/fixtures/short-5s.mov'); await player.pg.locator('.clipchosen').waitFor(); await player.pg.fill('#watch', 'Left-hand finish');
await player.pg.getByRole('button', { name: 'Send to my coach' }).click(); await player.gotIt(); ok(await player.pg.locator('.sla-clock').count() === 1, 'player sees reply-by clock after submitting');
ok((await player.api('/api/snapshot')).snapshot.clips.some((c) => c.watchFor === 'Left-hand finish' && c.mime === 'video/quicktime' && Math.round(c.durationSec) === 5), 'live: clip uploaded through the API (server read 5 s from the MOV container)');
{ const cid = (await player.api('/api/snapshot')).snapshot.clips.at(-1).id; ok((await ops.api(`/api/clips/${cid}`)).error, 'live: ops is refused the clip'); }

// 6 · Assistant reviews → Sign-off (family can’t see it yet)
await asst.go('/coach'); await asst.pg.locator('.qrow', { hasText: 'Kai Rook' }).filter({ hasText: 'Work ready' }).click(); await asst.pg.waitForTimeout(300);
await asst.pg.locator('.clipplayer video').waitFor(); await asst.pg.waitForFunction(() => document.querySelector('.clipplayer video')?.readyState >= 1, null, { timeout: 10000 }); ok(true, 'live: assigned coach streams the clip from /api/clips'); await asst.pg.evaluate(() => { document.querySelector('.clipplayer video').currentTime = 3; }); await asst.pg.waitForTimeout(300); await asst.pg.locator('#addnote').click(); await asst.pg.locator('.tnote-edit input').first().fill('finish high off the glass');
await asst.pg.fill('#f-wentWell', 'Good tempo all three sets'); await asst.pg.fill('#f-adjust', 'Same speed, eyes on the rim'); await asst.pg.fill('#f-why', 'Left-hand finishes win you minutes'); await asst.pg.getByRole('button', { name: /^Approve/ }).click(); await asst.gotIt();
await player.pg.reload(); await player.pg.waitForTimeout(600); ok(/head coach checking/i.test(await player.pg.locator('main').innerText()), 'player sees “head coach checking it” (same Sign-off state)');

// 7 · Head coach: inbox + sign-off queue item, signs off with an edit
const head = await persona('head'); await head.login('head@demo.test', 'demo-pass-123');
await head.go('/coach/inbox'); ok(await head.pg.locator('.urow', { hasText: 'Sign-off needed' }).count() >= 1, 'head coach notified: sign-off needed'); await head.shot('25-inbox', false);
await head.go('/coach'); ok(await head.pg.locator('.qrow', { hasText: 'Kai Rook' }).filter({ hasText: 'Sign-off' }).count() === 1, 'Sign-off routed to the head coach queue'); await head.shot('26-head-action-center');
await head.pg.locator('.qrow', { hasText: 'Kai Rook' }).click(); await head.pg.waitForTimeout(300); await head.shot('27-signoff', false);
await head.pg.fill('#ed-adjust', 'Same speed, eyes on the rim, finish high'); await head.pg.getByRole('button', { name: /Sign off with edits/ }).click(); await head.gotIt();

// 8 · Player sees the next step + notification
await player.pg.reload(); await player.pg.waitForTimeout(700); const today = await player.pg.locator('main').innerText();
ok(/One thing to work on/i.test(today) && /finish high/.test(today) && /What you did well/i.test(today), 'player sees the next step + the signed-off structured feedback'); await player.shot('28-player-next-step');
// 8b · ❓ on feedback → thread tied to the feedback + Reply needed in the assigned coach's queue → reply
ok(/0:03/.test(today) && /In your words/i.test(today), 'live: focus card with the clip note and the teach-back prompt');
await player.pg.locator('#ack-q').click(); await player.pg.locator('#ackq').fill('Finish high on which side?'); await player.pg.getByRole('button', { name: 'Send question' }).click(); await player.pg.waitForTimeout(600);
await asst.go('/coach'); const qrow = asst.pg.locator('.qrow', { hasText: 'Kai Rook' }).filter({ hasText: 'On your feedback' }); ok(await qrow.count() === 1, 'live: question on feedback → Reply needed in the assistant’s queue');
await qrow.click(); await asst.pg.waitForTimeout(500); await asst.pg.fill('#msg', 'Both. Left first.'); await asst.pg.getByRole('button', { name: 'Send' }).click(); await asst.pg.waitForTimeout(500);
await asst.go('/coach'); ok(await asst.pg.locator('.qrow', { hasText: 'Kai Rook' }).filter({ hasText: 'On your feedback' }).count() === 0, 'live: reply in the feedback thread clears it');
await player.go('/app/inbox'); ok(/Feedback:/.test(await player.pg.locator('main').innerText()), 'live: player inbox shows the feedback thread');
// 8c · teach-back in the player's own words → coach marks it → player is told
await player.go('/app'); await player.pg.fill('#tb-change', 'Left first, finish high off the glass.'); await player.pg.locator('#tb-send').click(); await player.pg.waitForTimeout(600);
ok((await player.api('/api/snapshot')).snapshot.reviews.some((r) => r.teachBack?.change.startsWith('Left first')), 'live: teach-back stored through the API');
const kaiId = (await asst.api('/api/snapshot')).snapshot.players.find((p) => p.name === 'Kai Rook').id; await asst.go('/coach/player/' + kaiId + '?tab=feedback'); await asst.pg.locator('#tb-got').click(); await asst.pg.waitForTimeout(600);
ok((await player.api('/api/notifications')).some((n) => n.type === 'teachback' && /got it/i.test(n.text)), 'live: coach marks “got it” → the player is told');
ok((await parent.api('/api/snapshot')).snapshot.reviews.some((r) => r.teachBack?.mark === 'got-it'), 'live: the parent can see the teach-back and the mark');
// 8d · “I’m stuck” stays private: coach sees it, the parent’s snapshot never contains it
await player.go('/app'); await player.pg.locator('#stuck-btn').click(); await player.pg.fill('#st-happened', 'Kept losing it at open gym and I felt bad'); await player.pg.locator('#stuck-send').click(); await player.pg.waitForTimeout(600); await player.shot('36-player-stuck', false);
ok(!JSON.stringify((await parent.api('/api/snapshot')).snapshot.messages).includes('open gym and I felt bad'), 'live: the parent’s data never contains the stuck note');
await asst.go('/coach'); const stuckRow = asst.pg.locator('.qrow', { hasText: 'Kai Rook' }).filter({ hasText: 'Check in' }); ok(await stuckRow.count() === 1, 'live: the coach has a private “Check in” item'); await stuckRow.click(); await asst.pg.waitForTimeout(400); await asst.pg.fill('#msg', 'Glad you told me. Everybody has those. See you Thursday.'); await asst.pg.getByRole('button', { name: 'Send' }).click(); await asst.pg.waitForTimeout(500);
ok((await player.api('/api/snapshot')).snapshot.messages.some((m) => m.context === 'checkin' && m.from === 'coach' && /Glad you told me/.test(m.text)), 'live: the coach’s own reply reaches the player'); ok(!JSON.stringify((await parent.api('/api/snapshot')).snapshot.messages).includes('Glad you told me'), 'live: and still never reaches the parent');
ok((await player.api('/api/notifications')).some((n) => n.type === 'feedback_ready'), 'player has a feedback_ready notification');

// 9 · Digest: coach approves, parent sees it + account/privacy tools
await asst.go('/coach/digest'); await asst.pg.locator('.panel', { hasText: 'Kai Rook' }).getByRole('button', { name: /Approve/ }).click(); await asst.pg.waitForTimeout(400);
await parent.go('/parent'); await parent.pg.waitForTimeout(800); const pv = await parent.pg.locator('main').innerText();  ok(/weekly note/i.test(pv) && /Kai sent \d+ check-in/.test(pv) && /What this means this week/i.test(pv), 'parent sees the approved digest and the one-sentence week');
ok(/Consent/i.test(pv) && /Given by Lou Rook/.test(pv), 'parent sees the timestamped consent record'); await parent.shot('29-parent-digest');
ok((await parent.api('/api/outbox')).error, 'parent is denied the outbox (403)');

// 10 · Head coach screens: team, library, settings, audit
await head.go('/coach/team'); ok(await head.pg.locator('.tcard').count() === 3, 'team view shows 3 staff'); ok(/Reassigned .* → Jamie Reed/.test(await head.pg.locator('main').innerText()), 'handoff appears on team view'); await head.shot('30-team');
await head.go('/coach/library'); await head.shot('31-library');
await head.go('/coach/settings'); await head.pg.getByRole('checkbox').uncheck(); await head.pg.getByRole('button', { name: 'Save settings' }).click(); await head.pg.getByText('Saved ✓').waitFor(); await head.pg.getByRole('checkbox').check(); await head.pg.getByRole('button', { name: 'Save settings' }).click(); await head.shot('32-settings');
await head.go('/coach/calendar'); await head.shot('33-calendar');
await head.go('/coach/audit'); ok(/consent/i.test(await head.pg.locator('main').innerText()), 'audit log has the consent record'); await head.shot('34-audit');
await ops.go('/ops/team'); await ops.shot('35-ops-team');
// 11 · v6 magic link through the log outbox; single use; sign out everywhere
const dana = await persona('dana'); await dana.go('/login?magic=1'); await dana.pg.locator('#ml').fill('dana@demo.test'); await dana.pg.getByRole('button', { name: 'Email me a sign-in link' }).click(); await dana.pg.getByText(/sign-in link is on its way/).waitFor(); await dana.shot('54-magic-request', false);
const ml = (await head.api('/api/outbox')).find((m) => m.kind === 'magic-link' && m.to === 'dana@demo.test'); ok(ml && ml.status === 'logged' && /#\/magic\?token=[a-f0-9]{64}/.test(ml.body), 'magic link delivered via the log provider');
const murl = ml.body.match(/(http\S+#\/magic\?token=[a-f0-9]{64})/)[1]; await dana.pg.goto(murl); await dana.pg.waitForURL(/#\/parent/, { timeout: 15000 }); ok(!!(await cookies(dana)), 'magic link signs Dana in → parent view');
const dana2 = await persona('dana2'); await dana2.pg.goto(murl); await dana2.pg.getByText(/already used/).waitFor(); ok(!(await cookies(dana2)), 'magic link is single-use');
// 12 · failed payment → grace → pause (simulator on the live server; DEMO=1 for the clock)
await head.go('/coach/billing'); await head.pg.locator('.billtable .trow', { hasText: 'Avery Pine' }).getByRole('button', { name: 'Simulate failed payment' }).click(); await head.pg.waitForTimeout(600);
ok(/Past due \(grace\)/i.test(await head.pg.locator('.billtable .trow', { hasText: 'Avery Pine' }).innerText()), 'live: failed payment → grace');
const hasClock = await head.pg.getByRole('button', { name: /\+8 days/ }).count();
if (hasClock) { await head.pg.getByRole('button', { name: /\+8 days/ }).click(); await head.pg.waitForTimeout(800); await head.go('/coach/billing'); ok(/Paused \(payment\)/i.test(await head.pg.locator('.billtable .trow', { hasText: 'Avery Pine' }).innerText()), 'live: grace over → paused'); }
await dana.go('/parent?p=avery&tab=billing'); await dana.pg.reload(); await dana.pg.waitForTimeout(800); const dbt = await dana.pg.locator('#billing').innerText(); if (!/(Payment failed|paused for billing)/i.test(dbt)) console.log('DBT', dbt); ok(/(Payment failed|paused for billing)/i.test(dbt), 'live: parent sees the payment problem');
await dana.go('/account'); await dana.pg.getByRole('button', { name: 'Sign out everywhere' }).click(); await dana.pg.waitForURL(/login/); ok(!(await cookies(dana)), 'sign out everywhere clears the session');
// sign out
await player.pg.getByRole('button', { name: 'Sign out' }).click(); await player.pg.waitForURL(/login/); ok(!(await cookies(player)), 'sign out clears the session');

// v8 Google sign-in on the real server: without GOOGLE_CLIENT_ID it is off and says so (the full OIDC flow is covered with a mocked JWKS in tests/google.test.ts)
{ const r = await fetch(API + '/api/auth/google/start', { redirect: 'manual' }); ok(r.status === 302 && /google=off/.test(r.headers.get('location') ?? ''), 'live: Google start without client id → explained, no redirect to Google');
  ok((await (await fetch(API + '/api/health')).json()).google === false, 'live: /api/health reports google:false');
  await visitor.go('/login?google=off'); ok(/isn’t set up/.test(await visitor.pg.locator('#google-msg').innerText()), 'live: sign-in page explains Google is off'); }
if (errs.length) throw new Error(errs.join('\n')); console.log('E2E MULTI OK'); await b.close();
