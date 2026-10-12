// End-to-end: drives every role through the shared workflow engine and checks state + next-step panels.
import { chromium } from 'playwright';
const B = process.env.BASE || 'http://localhost:4180/baller-connection/';
const b = await chromium.launch({ executablePath: process.env.CHROME }); const errs = [];
const pg = await b.newPage({ viewport: { width: 1280, height: 880 } });
pg.on('pageerror', (e) => errs.push(e.message)); pg.on('dialog', (d) => d.accept());
const go = async (h) => { await pg.goto(B + '#' + h); await pg.waitForTimeout(350); };
const shot = (n, full = true) => pg.screenshot({ path: `shots/${n}.png`, fullPage: full });
const ok = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('  ✓', m); };
const gotIt = async () => { const g = pg.getByRole('button', { name: 'Got it', exact: true }); if (await g.count()) await g.first().click({ timeout: 3000 }).catch(() => {}); };
const state = async (pid) => pg.evaluate((id) => JSON.parse(localStorage.getItem('baller-connection-v7')).players.find((p) => p.id === id || p.name === id).state, pid);
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
ok(await pg.evaluate(() => JSON.parse(localStorage.getItem('baller-connection-v7')).outbox.some((m) => m.to === 'pat@demo.test' && m.kind === 'invite')), 'invite email queued to the outbox');
await pg.locator('.demobar').getByRole('button', { name: 'Head coach' }).click(); await pg.waitForTimeout(300);
await go('/coach'); ok(await pg.locator('.capacity').innerText().then((t) => /6\/15/.test(t)), 'capacity meter shows 6/15');

// Onboarding Theo
await go('/invite'); await pg.fill('#ic', '246810'); await pg.fill('#ipn', 'Morgan Banks'); await pg.fill('#ie', 'morgan@demo.test'); await pg.getByRole('button', { name: /Accept invite/ }).click(); await pg.waitForTimeout(400); ok(await state('theo') === 'Onboarding', 'Invited → Onboarding (backup code)');
// v6: invite → plan & pay (simulated Stripe Checkout) → onboarding
ok(await pg.getByRole('button', { name: 'Continue', exact: true }).isDisabled(), 'onboarding can’t start before payment'); await shot('46-welcome-pay', false);
await pg.getByRole('radio', { name: /Development/ }).click(); await pg.getByRole('button', { name: 'Continue to secure checkout' }).click(); await pg.waitForURL(/#\/checkout/); ok(/TEST MODE/i.test(await pg.locator('main').innerText()), 'checkout simulator is clearly test mode'); await shot('47-checkout-sim', false);
await pg.fill('#cc', '4000 0000 0000 0002'); await pg.getByRole('button', { name: /Subscribe/ }).click(); await pg.getByText(/card was declined/).waitFor(); ok(await state('theo') === 'Onboarding', 'declined test card: nothing changes');
await pg.fill('#cc', '4242 4242 4242 4242'); await pg.getByRole('button', { name: /Subscribe/ }).click(); await pg.waitForURL(/#\/welcome/); await pg.waitForTimeout(400);
ok(await pg.evaluate(() => { const s = JSON.parse(localStorage.getItem('baller-connection-v7')); const t = s.players.find((p) => p.id === 'theo'); return t.billing === 'paid' && t.tier === 'Development' && s.outbox.some((m) => m.kind === 'payment-receipt' && m.to === 'morgan@demo.test'); }), 'checkout → paid on Development + receipt email');
await pg.getByRole('radio', { name: 'Guard' }).click(); await pg.getByRole('button', { name: 'Continue' }).click();
await pg.fill('#g', 'Make the travel team'); await pg.fill('#pr', 'My crossover'); await pg.fill('#fr', 'Getting the ball stolen'); await pg.getByRole('button', { name: 'Continue' }).click();
await pg.getByRole('radio', { name: 'Watch, then try' }).click(); await pg.getByRole('button', { name: 'Continue' }).click();
await pg.getByRole('radio', { name: '3 days a week' }).click(); await pg.getByRole('radio', { name: 'After school' }).click(); await pg.getByRole('button', { name: 'Continue' }).click();
await pg.fill('#gn', 'Morgan Banks'); await pg.getByRole('checkbox').check(); await pg.getByRole('button', { name: /Agree & finish/ }).click();
await pg.getByText('Welcome, Theo.').waitFor(); ok(await state('theo') === 'Plan building', 'Onboarding → Plan building'); await shot('05-welcome', false);

// Player sees plan building with SLA
await go('/app?p=theo'); await gotIt(); ok(await pg.locator('#rep').innerText().then((t) => /building your plan/i.test(t) && /lands by/i.test(t)), 'Today: plan building + when it lands'); ok(/Hi Theo!/i.test(await pg.locator('.hello').innerText()), 'Today greeting is age-appropriate (Theo is 11)');

// Coach builds plan
await go('/coach/plan/theo'); await pg.fill('#fo', 'Eyes-up dribbling'); await pg.getByRole('button', { name: /Two-ball pound/ }).click(); await shot('06-coach-plan-builder', false);
await pg.getByRole('button', { name: 'Publish plan' }).click(); await gotIt(); ok(await state('theo') === 'Plan set', 'Plan building → Plan set');

// Player opens plan, submits rep → level up moment
await go('/app?p=theo'); ok(/You said: “Make the travel team\.”/.test(await pg.locator('#rep').innerText()), 'onboarding goal flows into Today in the player’s own words'); await pg.getByRole('button', { name: /Read my focus/ }).click(); await gotIt(); ok(await state('theo') === 'Work ready', 'Plan set → Work ready');
for (let i = 1; i <= 4; i++) await pg.getByRole('button', { name: `Set ${i}`, exact: true }).click();
await pg.fill('#refl', 'Kept my eyes up for most of the sets.');
// v5 clip: a 35 s clip is refused in the browser with a trim hint; a 4 s clip is accepted
await pg.setInputFiles('#clipfile', 'tests/fixtures/long-35s.mp4'); await pg.locator('[data-clip="error"]').waitFor(); ok(/35 s.*30 s max/.test(await pg.locator('[data-clip="error"]').innerText()) && await pg.locator('[data-clip="trim"]').count() === 1, 'clip > 30 s refused client-side with a trim hint'); await shot('41-clip-too-long', false);
await pg.setInputFiles('#clipfile', 'tests/fixtures/short-4s.mp4'); await pg.locator('.clipchosen').waitFor(); ok(/Clip ready · 4 s/.test(await pg.locator('.clipchosen').innerText()), 'short clip accepted (duration read from video metadata)');
await pg.fill('#watch', 'My eyes on the crossover'); await pg.getByRole('button', { name: '+ Handles 10 min' }).click(); await gotIt(); await shot('07-player-today-checkin');
await pg.getByRole('button', { name: 'Submit to coach' }).click(); await pg.locator('.moment').waitFor(); await pg.waitForTimeout(700);
const m = await pg.locator('.moment').innerText(); ok(/Level up|Rep submitted/i.test(m) && /What’s next/i.test(m) && /acts next/i.test(m), 'celebration + what’s-next after submit'); await shot('08-moment-level-up', false);
await gotIt(); ok(await state('theo') === 'Submitted', 'Work ready → Submitted');
ok(await pg.locator('.sla-clock').count() === 1, 'Today shows coach reply-by clock'); ok(/4 s clip/.test(await pg.locator('#rep').innerText()), 'Today shows the clip went with the check-in');
ok(await pg.evaluate(() => { const s = JSON.parse(localStorage.getItem('baller-connection-v7')); const sub = s.submissions.filter((x) => x.playerId === 'theo').at(-1); return !!sub.clipId && s.clips.find((c) => c.id === sub.clipId)?.watchFor === 'My eyes on the crossover'; }), 'submission carries the clip + what-to-watch-for note');

// Coach reviews: approve Theo (last rep → cycle review), retry Riley
await go('/coach/review/theo'); const rv = await pg.locator('.review').innerText(); ok(/Show-me/.test(rv) && /proud of my crossover/i.test(rv) && /stolen/.test(rv), 'review panel: learning-style template + Coach-knows summary from onboarding');
ok((await pg.getAttribute('#f-adjust', 'placeholder')).startsWith('Watch:'), 'feedback template adapts to “Watch, then try”');
await pg.locator('.clipplayer video').waitFor(); await pg.waitForFunction(() => document.querySelector('.clipplayer video')?.readyState >= 1); ok(/My eyes on the crossover/.test(await pg.locator('.rv-left').innerText()), 'coach sees the clip inline with the player’s watch-for note');
await pg.getByRole('button', { name: '0.5×' }).click(); ok(await pg.evaluate(() => document.querySelector('.clipplayer video').playbackRate) === 0.5, 'clip plays at 0.5×');
await pg.evaluate(() => { document.querySelector('.clipplayer video').currentTime = 2; }); await pg.waitForTimeout(250); await pg.keyboard.press('k'); await pg.waitForTimeout(150); const ct = await pg.evaluate(() => document.querySelector('.clipplayer video').currentTime); ok(ct > 2 && ct < 2.1, 'K steps one frame forward');
await pg.locator('#addnote').click(); await pg.locator('.tnote-edit input').first().fill('eyes drop on the cross'); ok(/0:02/.test(await pg.locator('.tnote-edit').innerText()), 'tap-to-timestamp note at 0:02');
ok(/⏱ \d:\d\d/.test(await pg.locator('.rtimer').innerText()), 'review timer visible');
await pg.fill('#f-wentWell', 'Eyes up all four sets'); await pg.getByRole('button', { name: /\+ Focus: Eyes-up dribbling/ }).click(); await pg.fill('#f-adjust', 'Watch the rim, then add speed'); await pg.fill('#f-why', 'Eyes up is how you make the travel team'); await shot('09-coach-review', false);
await pg.locator('#f-why').focus(); await pg.keyboard.press('Control+Enter'); await pg.waitForTimeout(400); await gotIt(); ok(await state('theo') === 'Next step ready', 'Ctrl+Enter sends: Submitted → Next step ready');
ok(await pg.evaluate(() => { const r = JSON.parse(localStorage.getItem('baller-connection-v7')).reviews.filter((x) => x.playerId === 'theo').at(-1); return r.notes?.[0]?.t === 2 && /eyes drop/.test(r.notes[0].text) && r.secondsSpent > 0; }), 'timestamp note + review time saved with the feedback');
await go('/app?p=theo'); const rep = await pg.locator('#rep').innerText(); ok(/What you did well/i.test(rep) && /Your focus this week/i.test(rep) && await pg.locator('#rep .fb').count() === 0 && /Watch the rim, then add speed/i.test(rep) && /0:02/.test(rep), 'player sees “Your focus this week”: adjustment, next rep, clip note');
ok(await pg.locator('#focus[data-ack="none"]').count() === 1 && await pg.getByRole('button', { name: /start next rep/i }).count() === 0, 'acknowledgment is required (no skip button)'); await shot('42-player-focus-card');
await pg.locator('#ack-yes').click(); await gotIt(); ok(await state('theo') === 'Cycle review', '“Got it, I’ll do this” → commitment logged → Cycle review (last rep)');
ok(await pg.evaluate(() => JSON.parse(localStorage.getItem('baller-connection-v7')).reviews.filter((x) => x.playerId === 'theo').at(-1).reaction === 'got_it'), 'commitment stored on the feedback');
// Cycle review: player then coach
await go('/app?p=theo'); await pg.getByRole('button', { name: /Do my cycle review/ }).click(); await pg.waitForTimeout(300); await pg.fill('#ci', 'Eyes up most of the time'); await pg.fill('#ch', 'Speed'); await pg.fill('#cw', 'Faster dribbling'); await shot('36-player-cycle-review'); await pg.getByRole('button', { name: 'Submit to coach' }).click(); await gotIt();
await go('/coach'); ok(await pg.locator('.qrow', { hasText: 'Theo Banks' }).filter({ hasText: 'Cycle review' }).count() >= 1, 'cycle review appears in the coach queue');
await go('/coach/cycle/theo'); ok(/Eyes up most of the time/.test(await pg.locator('main').innerText()), 'coach sees the player’s cycle reflection'); await pg.getByRole('button', { name: 'Raise Ball security' }).click(); await pg.fill('#cs', 'Eyes up is a habit now.'); await shot('37-coach-cycle-review');
await pg.getByRole('button', { name: /Complete review/ }).click(); await gotIt(); ok(await pg.inputValue('#fo') === 'Faster dribbling', 'next focus carries into the plan builder');
ok(await pg.evaluate(() => JSON.parse(localStorage.getItem('baller-connection-v7')).cycleReviews.some((c) => c.playerId === 'theo' && c.ratingsAfter['Ball security'] === 2)), 'rubric re-rated in the cycle review');
await pg.locator('.demobar').getByRole('button', { name: 'Assistant' }).click(); await pg.waitForTimeout(300);
await go('/coach/review/riley'); await pg.fill('#f-wentWell', 'Good hands on the catch.'); await pg.fill('#f-adjust', 'Set your feet before the catch.'); await pg.fill('#f-why', 'Balanced feet make the shot repeatable.'); await pg.getByRole('button', { name: /Another attempt/ }).click(); await gotIt();
ok(await state('riley') === 'Sign-off', 'assistant review → Sign-off (head coach sign-off required)');
await pg.locator('.demobar').getByRole('button', { name: 'Head coach' }).click(); await pg.waitForTimeout(300);
await go('/coach/review/riley'); await pg.getByRole('button', { name: /^Sign off/ }).click(); await gotIt();
ok(await state('riley') === 'Work ready', 'head sign-off → Work ready (another attempt)');
await go('/app?p=riley'); ok(await pg.getByText('Another attempt · with your coach’s adjustment').count() === 1, 'player sees retry with the adjustment');
ok(await pg.locator('#focus').count() === 1 && await pg.locator('#refl').count() === 0 && /Confirm your coach’s adjustment/.test(await pg.locator('#rep').innerText()), 'retry: confirm the adjustment before logging'); await pg.locator('#ack-yes').click(); await pg.waitForTimeout(300); ok(await pg.locator('#refl').count() === 1 && await pg.locator('#focus[data-ack="got_it"]').count() === 1, 'after “Got it” the rep is on Today with the focus pinned');
// ❓ on feedback → thread + queue item (Nia, assistant's player)
await go('/app?p=nia'); await pg.locator('#ack-q').click(); await pg.fill('#ackq', 'Same tempo on the left too?'); await pg.getByRole('button', { name: 'Send question' }).click(); await pg.waitForTimeout(300); ok(await pg.locator('#focus[data-ack="question"]').count() === 1, '“I have a question” on the focus card');
ok(await pg.evaluate(() => JSON.parse(localStorage.getItem('baller-connection-v7')).messages.some((m) => m.context === 'feedback' && m.refId === 'r_ni2' && m.dueBy)), 'question creates a feedback-linked message with a reply-by');
await go('/app/inbox?p=nia'); ok(/Feedback: /.test(await pg.locator('.ulist').innerText()), 'player inbox shows the feedback thread'); await shot('38-player-inbox');
await pg.locator('.demobar').getByRole('button', { name: 'Assistant' }).click(); await pg.waitForTimeout(300); await go('/coach'); ok(await pg.locator('.qrow', { hasText: 'Nia Fable' }).filter({ hasText: 'Question on feedback' }).count() === 1, 'question → Reply needed in the assigned coach’s queue');
// Promise card updates when the coach keeps a promise
await go('/parent?p=nia'); ok(/Being handled/i.test(await pg.locator('[data-promise="monthly-video"]').innerText()), 'promise card: monthly video check-in at risk'); await shot('39-parent-promises');
await go('/coach/player/nia'); ok(await pg.locator('.riskbox').count() === 1, 'coach sees promise risk on the profile'); const soon = new Date(Date.now() + 2 * 864e5); soon.setMinutes(soon.getMinutes() - soon.getTimezoneOffset()); await pg.fill('#sw', soon.toISOString().slice(0, 16)); await pg.getByRole('button', { name: 'Schedule' }).click(); await pg.waitForTimeout(300);
await go('/parent?p=nia'); ok(/On track/i.test(await pg.locator('[data-promise="monthly-video"]').innerText()), 'promise card updates to On track after the check-in is booked');
await pg.locator('.demobar').getByRole('button', { name: 'Head coach' }).click(); await pg.waitForTimeout(300);

// Clock + SLA escalation, messages
await go('/app/messages?p=avery'); await pg.fill('#nm', 'Can I do extra sets on Saturday?'); await pg.getByRole('button', { name: 'Send' }).click(); await pg.waitForTimeout(300); ok(/Coach replies by/.test(await pg.locator('.uthread').innerText()), 'message shows its expected reply time');
await go('/coach'); ok(await pg.locator('.qrow', { hasText: 'Avery Pine' }).filter({ hasText: /Reply needed/i }).count() === 1, 'player message → Reply needed');
await pg.getByRole('button', { name: /\+1 day/ }).click(); await pg.waitForTimeout(300); await gotIt(); ok(await queueMatches(), 'queue counts equal rows after +1 day');
const kinds = await pg.locator('.queue .qrow').evaluateAll((els) => els.map((e) => e.classList.contains('overdue'))); ok(kinds.indexOf(false) === -1 || !kinds.slice(kinds.indexOf(false)).includes(true), 'overdue items ranked first');
await go('/coach'); await pg.locator('.qrow', { hasText: 'Avery Pine' }).filter({ hasText: /Reply needed/i }).click(); await pg.waitForTimeout(300); await shot('40-coach-thread', false); await pg.fill('#msg', 'Yes, two extra sets.'); await pg.getByRole('button', { name: 'Send' }).click();
await go('/coach'); ok(await pg.locator('.qrow', { hasText: 'Avery Pine' }).filter({ hasText: /Reply needed/i }).count() === 0, 'coach reply clears Reply needed');
await go('/coach/player/riley?tab=canvas'); await shot('10-coach-player-canvas', false);

// Parent: pause/resume + digest
await go('/coach/digest'); await pg.locator('.panel', { hasText: 'Avery Pine' }).getByRole('button', { name: /Approve/ }).click(); await gotIt();
await go('/parent?p=avery'); ok(await pg.locator('.quote').count() >= 1, 'approved digest visible to parent'); await shot('11-parent-view');
await pg.getByRole('button', { name: 'Pause coaching' }).click(); await gotIt(); ok(await state('avery') === 'Paused', 'pause'); await pg.getByRole('button', { name: 'Resume coaching' }).click(); await gotIt(); ok(await state('avery') === 'Work ready', 'resume returns to prior state');

await go('/app/progress?p=avery'); await shot('12-player-progress');
await go('/app/development?p=avery'); await shot('13-player-development');
await go('/log'); ok(await pg.locator('.ev').count() > 15, 'system log shows events'); await shot('14-system-log', false);
await go('/coach/roster'); await shot('15-coach-roster', false);
await go('/coach/library'); ok(await pg.locator('.drill').count() >= 6, 'library lists drills'); await go('/coach/team'); ok(await pg.locator('.tcard').count() === 3, 'team view (demo)'); await go('/coach/inbox'); ok(await pg.locator('.urow').count() > 0, 'unified inbox lists threads + notifications (demo)');
// v5: parent clip privacy + coach ack status
await go('/parent?p=riley'); ok(/90 days/.test(await pg.locator('#clips').innerText()) && await pg.locator('#clips').getByRole('button', { name: 'Delete clip' }).count() >= 1, 'parent sees stored clips with auto-delete date + Delete clip'); await pg.locator('#clips').screenshot({ path: 'shots/43-parent-clips.png' });
await pg.locator('.demobar').getByRole('button', { name: 'Head coach' }).click(); await pg.waitForTimeout(300); await go('/coach'); ok(await pg.locator('.qrow', { hasText: 'Avery Pine' }).filter({ hasText: 'Not confirmed' }).count() === 1, 'unconfirmed feedback (48 h+) → Not confirmed queue item'); await shot('44-coach-not-confirmed', false);
await go('/coach/player/avery?tab=feedback'); ok(/Not confirmed · \d+ h · nudged/i.test(await pg.locator('main').innerText()), 'coach sees ack status per feedback');
// v6: billing — failed payment → 7-day grace → pause → card updated → resumes
await go('/parent?p=avery&tab=billing'); const bt = await pg.locator('#billing').innerText().catch((e) => 'ERR ' + e.message.slice(0, 80)); ok(/Active/i.test(bt), 'parent billing shows Active + next charge'); await pg.locator('#billing').screenshot({ path: 'shots/48-parent-billing.png' });
await pg.locator('.demobar').getByRole('button', { name: 'Head coach' }).click(); await go('/coach/billing'); ok(/MRR/i.test(await pg.locator('main').innerText()), 'coach billing view shows MRR');
await pg.locator('.billtable .trow', { hasText: 'Avery Pine' }).getByRole('button', { name: 'Simulate failed payment' }).click(); await pg.waitForTimeout(300);
ok(/Past due \(grace\)/i.test(await pg.locator('.billtable .trow', { hasText: 'Avery Pine' }).innerText()), 'failed payment → Past due (grace)'); ok(await state('avery') !== 'Paused', 'coaching continues during grace'); await shot('49-coach-billing', false);
await pg.getByRole('button', { name: /\+8 days/ }).click(); await pg.waitForTimeout(300); await gotIt(); ok(await state('avery') === 'Paused', 'grace over → coaching paused'); ok(/Paused \(payment\)/i.test(await pg.locator('.billtable .trow', { hasText: 'Avery Pine' }).innerText()), 'billing view: Paused (payment)');
await go('/parent?p=avery&tab=billing'); ok(/paused for billing/i.test(await pg.locator('#billing').innerText()), 'parent sees the billing pause'); await pg.locator('#billing').screenshot({ path: 'shots/50-parent-paused.png' });
await pg.locator('#billing').getByRole('button', { name: /Manage billing/ }).click(); await pg.waitForURL(/#\/billing\/portal/); await shot('51-portal-sim', false); await pg.getByRole('button', { name: /Update card/ }).click(); await pg.getByText(/Card updated/).waitFor(); ok(await state('avery') !== 'Paused', 'payment received → coaching resumes automatically');
await pg.locator('.demobar').getByRole('button', { name: 'Ops' }).click(); await go('/ops/outbox'); await pg.locator('.mailrow', { hasText: 'Payment didn’t go through' }).first().click(); await pg.waitForTimeout(300); ok(await pg.locator('iframe.mailhtml').count() === 1, 'outbox previews the HTML email'); await shot('52-outbox-html', false);
await go('/account'); ok(/Quiet hours/i.test(await pg.locator('main').innerText()), 'email settings page'); await pg.getByRole('checkbox').first().uncheck(); await pg.getByRole('button', { name: 'Save email settings' }).click(); await pg.getByText('Saved ✓').waitFor(); await shot('53-account', false);
for (const r of ['/privacy', '/terms', '/support']) { await go(r); ok(await pg.locator('h1').count() === 1, r + ' renders'); }

// ---------- v7: games, transfer, confidence, shooting log, timeline, Player Card, landing ----------
await go('/'); await pg.evaluate(() => localStorage.clear()); await go('/');
ok(await pg.locator('.jband li').count() === 4 && /Play.*Reflect.*Coach.*Improve/is.test(await pg.locator('.journey').innerText()), 'landing: Play, Reflect, Coach, Improve band');
ok(/real coach watching/i.test(await pg.locator('.hero h1').innerText()), 'landing: headline angle'); ok(await pg.locator('.phone .ph-chart').count() === 1, 'landing: phone mockup of the timeline'); ok(/placeholder/i.test(await pg.locator('.founder').innerText()), 'landing: founder-why block marked placeholder');
ok(/Self-tracking apps show you numbers/.test(await pg.locator('.compare').innerText()), 'landing: comparison line (no competitor named)');
await pg.locator('.journey').scrollIntoViewIfNeeded(); await pg.screenshot({ path: 'shots/55-home-journey.png' }); await pg.locator('.tlband').screenshot({ path: 'shots/56-home-timeline-phone.png' });
const v7 = () => pg.evaluate(() => JSON.parse(localStorage.getItem('baller-connection-v7')));
// Game plan card + game log (Avery, 13): conf 3 then 2 after a seeded 4 → coach-only confidence flag
await go('/app/games?p=avery'); ok(/Weak-hand control/.test(await pg.locator('#gameplan').innerText()), 'game plan card shows the current focus + cue');
await pg.getByRole('button', { name: /Write my line/ }).click(); await pg.fill('#aff', 'I’ve done the left-hand reps. I trust them.'); await pg.getByRole('button', { name: 'Save', exact: true }).click(); await pg.waitForTimeout(200);
ok(/I trust them/.test(await pg.locator('#gameplan').innerText()), 'affirmation saved in the player’s words');
const logGame = async (conf, tried, well, ask, pts) => { await pg.fill('#g-opp', 'Hillcrest'); if (pts) { for (let i = 0; i < pts; i++) await pg.getByRole('button', { name: 'Points plus one' }).click(); }
  await pg.locator(`[data-scale="confidence"]`).nth(conf - 1).click(); await pg.locator(`[data-scale="focus"]`).nth(2).click(); await pg.locator(`[data-scale="energy"]`).nth(3).click();
  await pg.getByRole('radio', { name: tried }).click(); await pg.fill('#g-well', well); if (ask) await pg.getByLabel(/Ask my coach for feedback/).check(); await pg.getByRole('button', { name: 'Log game' }).click(); await pg.waitForTimeout(300); await gotIt(); };
await logGame(3, 'Sometimes', 'Two steals in the third quarter', true, 5); await shot('57-game-log');
let st7 = await v7(); const ga = st7.games.filter((g) => g.playerId === 'avery').at(-1); ok(ga.stats.pts === 5 && ga.confidence === 3 && ga.focusTried === 'sometimes' && ga.wantsReply && !!ga.dueBy, 'game log saved: stats, check-in, focus question, feedback asked with a reply-by');
await logGame(2, 'Not yet', 'Kept talking on defense', false, 0); st7 = await v7(); ok(st7.notifications.some((n) => n.type === 'confidence' && n.userId === 'u_head'), 'confidence dipped 2 games in a row → coach notified');
ok(await pg.locator('.riskbox', { hasText: 'Coach-only' }).count() === 0, 'the player never sees the confidence flag');
// Young mode (Sam, 12): emoji scale, fewer stats
await go('/app/games?p=sam'); ok(await pg.locator('.sbtn .emo').count() === 15 && await pg.locator('#st-fga').count() === 0, 'under-13: emoji scale and fewer stats'); await pg.locator('#gamelog').screenshot({ path: 'shots/58-game-log-young.png' });
// Coach: queue items, game reply in standard format, confidence item clears
await pg.locator('.demobar').getByRole('button', { name: 'Head coach' }).click(); await go('/coach');
ok(await pg.locator('.qrow', { hasText: 'Avery Pine' }).filter({ hasText: 'Game check-in' }).count() === 1, 'asked-for game → owed “Game check-in” with SLA'); ok(await pg.locator('.qrow', { hasText: 'Avery Pine' }).filter({ hasText: 'Confidence' }).count() === 1, 'coach queue: gentle Confidence item'); ok(await queueMatches(), 'queue chips match rows'); await shot('59-coach-queue-v7', false);
await go('/coach/player/avery?tab=games'); const asked = pg.locator('.gamecard.ask'); await asked.getByRole('button', { name: 'Write reply' }).click();
await asked.locator('input[id^="gw-"]').fill('Two steals: you read the passing lane'); await asked.locator('input[id^="ga-"]').fill('Go left on the first touch after a steal'); await asked.locator('input[id^="gy-"]').fill('That is weak-hand control under pressure'); await asked.getByRole('button', { name: 'Send game feedback' }).click(); await pg.waitForTimeout(250);
st7 = await v7(); ok(/→ Go left on the first touch/.test(st7.games.find((g) => g.id === ga.id).reply.feedback), 'coach replies to the game in the standard feedback format');
const last = pg.locator('.gamecard').first(); await last.getByRole('button', { name: 'Reply' }).click(); await last.locator('input[id^="gw-"]').fill('You kept talking when it was hard'); await last.locator('input[id^="ga-"]').fill('Next game: one left-hand drive early'); await last.locator('input[id^="gy-"]').fill('An early make settles the nerves'); await last.getByRole('button', { name: 'Send game feedback' }).click(); await pg.waitForTimeout(250);
await go('/coach'); ok(await pg.locator('.qrow', { hasText: 'Avery Pine' }).filter({ hasText: 'Confidence' }).count() === 0, 'replying clears the Confidence item');
// Game transfer cue (Riley: focus showed up in 0 (+1 sometimes) of 3 games)
await go('/coach/player/riley?tab=games'); ok(await pg.locator('#transfer-cue').count() === 1 && (await pg.locator('.transfer').first().getAttribute('data-transfer')) === '17', 'transfer metric 17% → game transfer cue'); await shot('60-coach-games-transfer');
// Coach timeline: annotate, story from data → edit → approve
await go('/coach/player/avery?tab=progress'); ok(await pg.locator('.tlchart .confdot').count() >= 6, 'timeline plots confidence for every game');
await pg.getByRole('button', { name: 'Draft from the data' }).click(); let story = await pg.locator('#story').inputValue(); ok(/Weak-hand control under pressure/.test(story) && /\[coach, add/.test(story), 'story draft cites the coach focus and asks for the coach’s words');
await pg.fill('#story', story.replace(/Why it matters:.*$/, 'Why it matters: the left hand is starting to trust itself at game speed.')); await pg.getByRole('button', { name: /Approve/ }).click(); await pg.waitForTimeout(250); await shot('61-coach-timeline', true);
await go('/coach/player/avery?tab=progress'); await pg.locator('#winx').fill('Called for the ball late in a close game'); await pg.getByRole('button', { name: '★ Tag win' }).click(); await pg.waitForTimeout(200);
// Player: timeline + wins wall
await go('/app/progress?p=avery'); ok(/trust itself at game speed/.test(await pg.locator('#timeline .story').innerText()), 'player sees the coach-approved “what changed and why”');
ok(/Called for the ball late/.test(await pg.locator('#wins').innerText()), 'Wins wall shows the coach-tagged moment'); await pg.locator('#timeline').screenshot({ path: 'shots/62-player-timeline.png' }); await pg.locator('#wins').screenshot({ path: 'shots/63-wins-wall.png' });
// Shooting log on a rep (5-spot court) → coach review
await go('/app?p=avery'); if (await pg.locator('#ack-yes').count()) { await pg.locator('#ack-yes').click(); await gotIt(); }
await go('/app?p=avery'); await pg.locator('.shotlog').evaluate((d) => { d.open = true; }); const shotTap = async (spot, makes, misses) => { await pg.locator(`.spot[data-spot="${spot}"]`).click(); for (let i = 0; i < makes; i++) await pg.getByRole('button', { name: '✓ Make' }).click(); for (let i = 0; i < misses; i++) await pg.getByRole('button', { name: '✗ Miss' }).click(); };
await shotTap(0, 3, 2); await shotTap(1, 2, 3); await shotTap(3, 4, 1); ok(/4\/5/.test(await pg.locator('.spot[data-spot="3"]').textContent()), 'tap court: 4/5 at right wing'); await pg.locator('.shotcourt').screenshot({ path: 'shots/64-shot-court.png' });
await pg.getByRole('button', { name: 'Set 1' }).click(); await pg.fill('#refl', 'Right wing felt automatic, left wing short.'); await pg.getByRole('button', { name: 'Submit to coach' }).click(); await pg.waitForTimeout(300); await gotIt();
st7 = await v7(); const sv = st7.submissions.filter((x) => x.playerId === 'avery').at(-1); ok(JSON.stringify(sv.shots) === JSON.stringify([[3, 5], [2, 5], [0, 0], [4, 5], [0, 0]]), 'shooting log saved with the check-in');
await pg.locator('.demobar').getByRole('button', { name: 'Head coach' }).click(); await go('/coach/review/avery'); ok(/9\/15 \(60%\).*best spot: Right wing 80%/i.test(await pg.locator('.shotsum').innerText()), 'coach review shows % and best spot'); await pg.locator('.shotsum').screenshot({ path: 'shots/65-review-shots.png' });
// Player Card: parent controls the private link and stats
await go('/parent?p=avery'); ok(await pg.locator('#card input[aria-label="Card link"]').count() === 0, 'card is private by default (no link)'); await pg.locator('#card-on').check(); await pg.waitForTimeout(200);
const link = await pg.locator('#card input[aria-label="Card link"]').inputValue(); ok(/#\/card\/[a-f0-9]{32}$/.test(link), 'parent turns on a private link'); await pg.locator('#card').screenshot({ path: 'shots/66-card-settings.png' });
let pub; const openCard = async () => { await pub?.close(); pub = await b.newPage({ viewport: { width: 520, height: 820 }, storageState: await pg.context().storageState() }); pub.on('pageerror', (e) => errs.push(e.message)); await pub.goto(link); await pub.waitForTimeout(500); }; // demo data lives in browser storage; live cards come from /api/card
await openCard();
ok(/Avery P\./i.test(await pub.locator('.pcard').innerText()) && await pub.locator('.pcard .pc-row div').count() === 1, 'shared card: last initial only, no stats by default'); await pub.screenshot({ path: 'shots/67-public-card.png' });
await pg.locator('#card-stats').check(); await pg.waitForTimeout(150); await openCard(); await pub.waitForTimeout(400); ok(/pts \/ game/i.test(await pub.locator('.pcard').innerText()), 'stats appear only after the parent opts in');
await pg.locator('#card-on').uncheck(); await pg.waitForTimeout(150); await openCard(); await pub.waitForTimeout(400); ok(await pub.locator('.pcard').count() === 0 && /off or was replaced/i.test(await pub.locator('main').innerText()), 'link off → card no longer shows'); await pub.close();
// (digest game + confidence summary: covered in tests/v7.test.ts; this week's digest already exists by this point of the run)

// ---------- v7 PWA: manifest, service worker under the Pages base path, installability, offline shell ----------
{
  const ctx = await b.newContext({ viewport: { width: 412, height: 860 }, isMobile: true }); const w = await ctx.newPage(); w.on('pageerror', (e) => errs.push(e.message));
  await w.goto(B + '#/app?p=avery'); await w.waitForTimeout(400);
  const scope = await w.evaluate(async () => (await navigator.serviceWorker.ready).scope); ok(scope === new URL(B).href, `service worker scoped to the base path (${scope})`);
  const man = await w.evaluate(async () => { const h = document.querySelector('link[rel=manifest]').href; return { h, j: await (await fetch(h)).json() }; });
  ok(new URL(man.j.start_url, man.h).href.startsWith(scope) && man.j.display === 'standalone', 'manifest start_url inside scope, standalone');
  const cdp = await ctx.newCDPSession(w); const inst = (await cdp.send('Page.getInstallabilityErrors')).installabilityErrors.filter((e) => e.errorId !== 'in-incognito'); ok(inst.length === 0, `Chrome installability check passes (${JSON.stringify(inst)}; automation profiles count as incognito, which is ignored)`);
  const mi = await cdp.send('Page.getAppManifest'); ok(!mi.errors?.length, 'manifest parses with no errors');
  await w.reload(); await w.waitForTimeout(500); const cached = await w.evaluate(async () => { const out = []; for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) out.push(r.url); return out; });
  ok(cached.length > 3 && cached.every((u) => !u.includes('/api/') && !/\.(mp4|mov|webm)$/.test(u) && !u.includes('/demo/')), `cache holds only the app shell (${cached.length} files, no API/clips)`);
  await ctx.setOffline(true); await w.goto(B + '#/app?p=avery'); await w.waitForTimeout(800); ok(await w.locator('.appshell, .appmain').count() > 0, 'offline: installed app still opens from the cached shell');
  await w.goto(B + 'some/deep/path'); await w.waitForTimeout(400); ok(/offline|Baller/i.test(await w.locator('body').innerText()), 'offline navigation falls back (shell or offline page)'); await ctx.setOffline(false);
  await w.goto(B + 'offline.html'); await w.screenshot({ path: 'shots/70-offline.png' });
  await w.goto(B + '#/account'); await w.waitForTimeout(400); ok(await w.locator('#push').count() === 1 && /Install the app/i.test(await w.locator('#install').innerText()), 'account shows phone notifications (opt-in) + install help');
  await w.locator('#push').screenshot({ path: 'shots/71-push-settings.png' });
  await ctx.close();
  const ios = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' });
  const iw = await ios.newPage(); await iw.goto(B + '#/app?p=avery'); await iw.waitForTimeout(600); ok(/Add to Home Screen/.test(await iw.locator('#install').innerText()), 'iPhone Safari gets Add to Home Screen steps'); await iw.locator('#install').screenshot({ path: 'shots/72-ios-install.png' }); await ios.close();
}

const mo = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true }); mo.on('pageerror', (e) => errs.push(e.message));
await mo.goto(B + '#/'); await mo.evaluate(() => localStorage.clear()); await mo.goto(B + '#/app?p=avery'); await mo.waitForTimeout(500); await mo.screenshot({ path: 'shots/16-mobile-today.png', fullPage: true });
await mo.goto(B + '#/'); await mo.waitForTimeout(400); await mo.screenshot({ path: 'shots/17-mobile-home.png' });
await mo.goto(B + '#/coach'); await mo.waitForTimeout(400); await mo.screenshot({ path: 'shots/18-mobile-coach.png', fullPage: true });
if (errs.length) throw new Error(errs.join('\n')); console.log('E2E OK'); await b.close();
