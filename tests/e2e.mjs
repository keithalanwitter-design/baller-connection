// End-to-end: drives every role through the shared workflow engine and checks state + next-step panels.
import { chromium } from 'playwright';
const B = process.env.BASE || 'http://localhost:4180/baller-connection/';
const b = await chromium.launch({ executablePath: process.env.CHROME }); const errs = [];
const pg = await b.newPage({ viewport: { width: 1280, height: 880 } });
pg.on('pageerror', (e) => errs.push(e.message)); pg.on('dialog', (d) => d.accept());
const go = async (h) => { await pg.goto(B + '#' + h); await pg.waitForTimeout(350); };
const shot = (n, full = true) => pg.screenshot({ path: `shots/${n}.png`, fullPage: full });
const ok = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('  ✓', m); };
const gotIt = async () => { const g = pg.getByRole('button', { name: 'Got it' }); if (await g.count()) await g.click(); };
const state = async (pid) => pg.evaluate((id) => JSON.parse(localStorage.getItem('baller-connection-v3')).players.find((p) => p.id === id || p.name === id).state, pid);
const queueMatches = async () => { const chips = (await pg.locator('.chips .chip b').allTextContents()).map(Number); const rows = await pg.locator('.queue .qrow').count(); return chips[0] === rows && chips.slice(1).reduce((a, c) => a + c, 0) === rows; };

await go('/'); await pg.evaluate(() => localStorage.clear()); await go('/');
ok(await pg.locator('.heroloop svg').count() === 1, 'animated hero loop renders'); await shot('01-home');
await go('/how'); ok(await pg.locator('.lane').count() === 4, 'workflow page shows 4 lanes'); await shot('02-how-it-works');

// Apply
await go('/apply'); await pg.fill('#pn', 'Casey Rowan'); await pg.fill('#pp', 'Pat Rowan'); await pg.fill('#pe', 'pat@demo.test'); await pg.getByRole('button', { name: 'Continue' }).click();
for (const t of ['13–14', '3–4 days', 'Both of us', 'Plan + regular feedback']) { await pg.getByRole('radio', { name: t }).click(); await pg.waitForTimeout(220); }
await pg.fill('#t', 'Make the 8th-grade A team'); await pg.getByRole('button', { name: 'See my result' }).click();
await pg.locator('.suggest').getByText('Development').waitFor(); await shot('03-apply-result', false);
await pg.getByRole('button', { name: 'Submit application' }).click(); await pg.getByText('Application in').waitFor();
ok(await state('Casey Rowan') === 'Applied', 'application → Applied');

// Coach: queue + fit review
await go('/coach'); ok(await pg.locator('.demobar').count() === 1, 'demo bar visible in demo mode'); ok(await queueMatches(), 'queue counts equal rows (initial, mine)');
await pg.getByRole('button', { name: 'Whole team' }).click();
const first = await pg.locator('.queue .qrow').first().innerText(); ok(/OVERDUE/.test(first) && /Riley Moss/.test(first) && /Jamie Reed/.test(first), 'whole team: overdue Riley at the top, routed to the assistant');
await shot('04-coach-action-center');
// Ops persona: intake
await pg.locator('.demobar').getByRole('button', { name: 'Ops' }).click(); await pg.waitForTimeout(300); ok(await pg.locator('.qrow', { hasText: 'Casey Rowan' }).filter({ hasText: 'New application' }).count() === 1, 'ops queue: new application');
await shot('19-demo-ops-queue', false);
await pg.locator('.qrow', { hasText: 'Casey Rowan' }).click(); await pg.getByRole('button', { name: /Open application/ }).click(); await gotIt();
ok(await state('Casey Rowan') === 'Fit review', 'Applied → Fit review');
await pg.getByRole('button', { name: /Send invite/ }).first().click(); await gotIt(); ok(await state('Casey Rowan') === 'Invited', 'Fit review → Invited (capacity ok)');
ok(await pg.evaluate(() => JSON.parse(localStorage.getItem('baller-connection-v3')).outbox.some((m) => m.to === 'pat@demo.test' && m.kind === 'invite')), 'invite email queued to the outbox');
await pg.locator('.demobar').getByRole('button', { name: 'Head coach' }).click(); await pg.waitForTimeout(300);
await go('/coach'); ok(await pg.locator('.capacity').innerText().then((t) => /6\/15/.test(t)), 'capacity meter shows 6/15');

// Onboarding Theo
await go('/invite'); await pg.fill('#ic', '246810'); await pg.fill('#ipn', 'Morgan Banks'); await pg.fill('#ie', 'morgan@demo.test'); await pg.getByRole('button', { name: /Accept invite/ }).click(); await pg.waitForTimeout(400); ok(await state('theo') === 'Onboarding', 'Invited → Onboarding (backup code)');
await pg.getByRole('radio', { name: 'Guard' }).click(); await pg.getByRole('button', { name: 'Continue' }).click();
await pg.fill('#g', 'Make the travel team'); await pg.getByRole('button', { name: 'Continue' }).click();
await pg.getByRole('radio', { name: 'Watch, then try' }).click(); await pg.getByRole('button', { name: 'Continue' }).click();
await pg.getByRole('radio', { name: '3 days a week' }).click(); await pg.getByRole('radio', { name: 'After school' }).click(); await pg.getByRole('button', { name: 'Continue' }).click();
await pg.fill('#gn', 'Morgan Banks'); await pg.getByRole('checkbox').check(); await pg.getByRole('button', { name: /Agree & finish/ }).click();
await pg.getByText('Welcome, Theo.').waitFor(); ok(await state('theo') === 'Plan building', 'Onboarding → Plan building'); await shot('05-welcome', false);

// Player sees plan building with SLA
await go('/app?p=theo'); await gotIt(); ok(await pg.locator('.path-panel').innerText().then((t) => /is building the plan/i.test(t) && /By when/i.test(t)), 'Today path panel: plan building + by when');

// Coach builds plan
await go('/coach/plan/theo'); await pg.fill('#fo', 'Eyes-up dribbling'); await pg.getByRole('button', { name: /Two-ball pound/ }).click(); await shot('06-coach-plan-builder', false);
await pg.getByRole('button', { name: 'Publish plan' }).click(); await gotIt(); ok(await state('theo') === 'Plan set', 'Plan building → Plan set');

// Player opens plan, submits rep → level up moment
await go('/app?p=theo'); await pg.getByRole('button', { name: /Read my focus/ }).click(); await gotIt(); ok(await state('theo') === 'Work ready', 'Plan set → Work ready');
for (let i = 1; i <= 4; i++) await pg.getByRole('button', { name: `Set ${i}`, exact: true }).click();
await pg.fill('#refl', 'Kept my eyes up for most of the sets.'); await pg.getByRole('button', { name: '+ Handles 10 min' }).click(); await gotIt(); await shot('07-player-today-checkin');
await pg.getByRole('button', { name: 'Submit to coach' }).click(); await pg.locator('.moment').waitFor(); await pg.waitForTimeout(700);
const m = await pg.locator('.moment').innerText(); ok(/Level up|Rep submitted/i.test(m) && /What’s next/i.test(m) && /acts next/i.test(m), 'celebration + what’s-next after submit'); await shot('08-moment-level-up', false);
await gotIt(); ok(await state('theo') === 'Submitted', 'Work ready → Submitted');
ok(await pg.locator('.sla-clock').count() === 1, 'Today shows coach reply-by clock');

// Coach reviews: approve Theo (last rep → cycle review), retry Riley
await go('/coach/review/theo'); await pg.fill('#fb', 'Eyes up all four sets. Next: add speed.'); await shot('09-coach-review', false);
await pg.getByRole('button', { name: /^Approve/ }).click(); await gotIt(); ok(await state('theo') === 'Next step ready', 'Submitted → Next step ready');
await go('/app?p=theo'); await pg.getByRole('button', { name: /start next rep/i }).click(); await gotIt(); ok(await state('theo') === 'Cycle review', 'Next step ready → Cycle review (cycle complete)');
await pg.locator('.demobar').getByRole('button', { name: 'Assistant' }).click(); await pg.waitForTimeout(300);
await go('/coach/review/riley'); await pg.fill('#fb', 'Set your feet before the catch.'); await pg.getByRole('button', { name: /Another attempt/ }).click(); await gotIt();
ok(await state('riley') === 'Sign-off', 'assistant review → Sign-off (head coach sign-off required)');
await pg.locator('.demobar').getByRole('button', { name: 'Head coach' }).click(); await pg.waitForTimeout(300);
await go('/coach/review/riley'); await pg.getByRole('button', { name: /^Sign off/ }).click(); await gotIt();
ok(await state('riley') === 'Work ready', 'head sign-off → Work ready (another attempt)');
await go('/app?p=riley'); ok(await pg.getByText('Another attempt · coach cue').count() === 1, 'player sees retry cue');

// Clock + SLA escalation, messages
await go('/app/messages?p=avery'); await pg.fill('#msg', 'Can I do extra sets on Saturday?'); await pg.getByRole('button', { name: 'Send' }).click();
await go('/coach'); ok(await pg.locator('.qrow', { hasText: 'Avery Pine' }).filter({ hasText: /Reply needed/i }).count() === 1, 'player message → Reply needed');
await pg.getByRole('button', { name: /\+1 day/ }).click(); await pg.waitForTimeout(300); await gotIt(); ok(await queueMatches(), 'queue counts equal rows after +1 day');
const kinds = await pg.locator('.queue .qrow').evaluateAll((els) => els.map((e) => e.classList.contains('overdue'))); ok(kinds.indexOf(false) === -1 || !kinds.slice(kinds.indexOf(false)).includes(true), 'overdue items ranked first');
await go('/coach/player/avery?tab=messages'); await pg.fill('#msg', 'Yes, two extra sets.'); await pg.getByRole('button', { name: 'Send' }).click();
await go('/coach'); ok(await pg.locator('.qrow', { hasText: 'Avery Pine' }).filter({ hasText: /Reply needed/i }).count() === 0, 'coach reply clears Reply needed');
await go('/coach/player/riley?tab=canvas'); await shot('10-coach-player-canvas', false);

// Parent: pause/resume + digest
await go('/coach/digest'); await pg.locator('.panel', { hasText: 'Avery Pine' }).getByRole('button', { name: /Approve/ }).click(); await gotIt();
await go('/parent?p=avery'); ok(await pg.locator('.quote').count() >= 1, 'approved digest visible to parent'); await shot('11-parent-view');
await pg.getByRole('button', { name: 'Pause plan' }).click(); await gotIt(); ok(await state('avery') === 'Paused', 'pause'); await pg.getByRole('button', { name: /Resume/ }).click(); await gotIt(); ok(await state('avery') === 'Work ready', 'resume returns to prior state');

await go('/app/progress?p=avery'); await shot('12-player-progress');
await go('/app/development?p=avery'); await shot('13-player-development');
await go('/log'); ok(await pg.locator('.ev').count() > 15, 'system log shows events'); await shot('14-system-log', false);
await go('/coach/roster'); await shot('15-coach-roster', false);
await go('/coach/library'); ok(await pg.locator('.drill').count() >= 6, 'library lists drills'); await go('/coach/team'); ok(await pg.locator('.tcard').count() === 3, 'team view (demo)'); await go('/coach/inbox'); ok(await pg.locator('.nitem').count() > 0, 'inbox has notifications (demo)');
for (const r of ['/privacy', '/terms', '/support']) { await go(r); ok(await pg.locator('h1').count() === 1, r + ' renders'); }

const mo = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true }); mo.on('pageerror', (e) => errs.push(e.message));
await mo.goto(B + '#/'); await mo.evaluate(() => localStorage.clear()); await mo.goto(B + '#/app?p=avery'); await mo.waitForTimeout(500); await mo.screenshot({ path: 'shots/16-mobile-today.png', fullPage: true });
await mo.goto(B + '#/'); await mo.waitForTimeout(400); await mo.screenshot({ path: 'shots/17-mobile-home.png' });
await mo.goto(B + '#/coach'); await mo.waitForTimeout(400); await mo.screenshot({ path: 'shots/18-mobile-coach.png', fullPage: true });
if (errs.length) throw new Error(errs.join('\n')); console.log('E2E OK'); await b.close();
