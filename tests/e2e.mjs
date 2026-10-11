import { chromium } from 'playwright';
const B = process.env.BASE || 'http://localhost:4173/baller-connection/';
const b = await chromium.launch({ executablePath: process.env.CHROME }); const errs = [];
const pg = await b.newPage({ viewport: { width: 1280, height: 860 } });
pg.on('pageerror', (e) => errs.push(e.message)); pg.on('dialog', (d) => d.accept());
const go = async (h) => { await pg.goto(B + '#' + h); await pg.waitForTimeout(400); };
const shot = (n, full = true) => pg.screenshot({ path: `shots/${n}.png`, fullPage: full });
await go('/'); await pg.evaluate(() => localStorage.clear()); await go('/'); await shot('01-home');
await go('/apply');
for (const t of ['Parent or guardian', '13–14', '3–4 days', 'Both of us', 'Plan + regular feedback']) { await pg.getByRole('radio', { name: t }).click(); await pg.waitForTimeout(250); }
await pg.fill('#t', 'Make the 8th-grade A team'); await shot('02-apply-question', false); await pg.getByRole('button', { name: 'See my result' }).click();
await pg.getByText('Development', { exact: true }).waitFor(); await shot('03-apply-result', false);
await pg.getByRole('button', { name: 'Submit application' }).click(); await pg.getByText('Application received').waitFor();
// coach before
await go('/coach'); await shot('04-coach-action-center');
const count = async () => { const chips = await pg.locator('.chip b').allTextContents(); const rows = await pg.locator('.queue .qrow').count(); return { all: +chips[0], sum: chips.slice(1).reduce((a, c) => a + +c, 0), rows }; };
let c = await count(); if (c.all !== c.rows || c.sum !== c.rows) throw new Error('count mismatch ' + JSON.stringify(c));
// review riley
await pg.getByRole('link', { name: /Riley Moss.*Work ready/ }).click(); await shot('05-coach-review');
await pg.fill('#fb', 'Good honest read on the left wing. Set your feet before the catch.'); await pg.getByRole('button', { name: 'Approve + send next rep' }).click();
await pg.waitForTimeout(300); c = await count(); if (c.all !== c.rows) throw new Error('mismatch after review');
// family riley sees next step
await go('/app?p=riley'); if (!(await pg.getByText('New feedback is in').isVisible())) throw new Error('riley no feedback'); await shot('06-player-next-step', false);
await pg.getByRole('button', { name: 'Start next rep →' }).click(); await pg.getByRole('button', { name: 'Log practice' }).waitFor();
// avery check-in
await go('/app?p=avery'); await pg.getByRole('button', { name: 'Log practice' }).click();
for (let i = 1; i <= 4; i++) await pg.getByRole('button', { name: `Set ${i}`, exact: true }).click();
await pg.fill('#refl', 'Slowed down and made 4 of 5 with my left.'); await pg.getByRole('button', { name: 'Ball-handling 10' }).click(); await shot('07-player-today-checkin');
await pg.getByRole('button', { name: 'Submit to coach' }).click(); await pg.getByText('Submitted ✓').waitFor();
await go('/app/development'); await shot('08-player-development');
await go('/app/progress'); await shot('09-player-progress', false);
await go('/app/messages'); await pg.fill('#msg', 'Can I do extra sets on Saturday?'); await pg.getByRole('button', { name: 'Send' }).click();
await go('/coach'); const t = await pg.locator('.queue').innerText(); if (!t.includes('Avery Pine') || !/Avery Pine\s*Reply needed/i.test(t)) throw new Error('avery not in queue: ' + t);
// sam plan
await pg.getByRole('link', { name: /Sam Quill.*Plan needed/ }).click(); await pg.fill('#fo', 'Dribbling in traffic with eyes up'); await pg.getByRole('button', { name: /Two-ball pound/ }).click(); await shot('10-coach-plan-builder');
await pg.getByRole('button', { name: 'Publish plan' }).click(); await go('/app?p=sam'); await pg.getByText('Two-ball pound series').first().waitFor();
// welcome theo
await go('/welcome'); await pg.getByRole('button', { name: 'Accept invite' }).click(); await pg.getByRole('radio', { name: 'Guard' }).click(); await pg.getByRole('button', { name: 'Continue' }).click();
await pg.fill('#g', 'Make the travel team'); await pg.getByRole('button', { name: 'Continue' }).click(); await pg.getByRole('radio', { name: 'Watch, then try' }).click(); await pg.getByRole('button', { name: 'Continue' }).click();
await pg.getByRole('radio', { name: '3 days a week' }).click(); await pg.getByRole('radio', { name: 'After school' }).click(); await pg.getByRole('button', { name: 'Finish' }).click();
await pg.getByText('Welcome, Theo.').waitFor(); await shot('11-welcome-coach-note', false);
await go('/coach/player/riley?tab=canvas'); await shot('12-coach-player-canvas', false);
await go('/coach/roster'); await shot('13-coach-roster', false);
await go('/coach/digest'); await pg.getByRole('button', { name: 'Approve' }).first().click(); await shot('14-coach-digest');
await go('/parent?p=avery'); await shot('15-parent-view');
for (const r of ['/privacy', '/terms', '/support']) { await go(r); if (!(await pg.locator('h1').count())) throw new Error(r); }
const m = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true }); await m.goto(B + '#/app?p=avery'); await m.waitForTimeout(400); await m.screenshot({ path: 'shots/16-mobile-today.png', fullPage: true });
await m.goto(B + '#/'); await m.waitForTimeout(400); await m.screenshot({ path: 'shots/17-mobile-home.png' });
if (errs.length) throw new Error(errs.join('\n')); console.log('E2E OK'); await b.close();
