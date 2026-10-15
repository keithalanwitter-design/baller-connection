// End-to-end: drives every role through the shared workflow engine and checks state + next-step panels.
import { chromium } from 'playwright';
const B = process.env.BASE || 'http://localhost:4180/baller-connection/';
const b = await chromium.launch({ executablePath: process.env.CHROME }); const errs = [];
const pg = await b.newPage({ viewport: { width: 1280, height: 880 } });
pg.on('pageerror', (e) => errs.push(e.message)); pg.on('dialog', (d) => d.accept());
const go = async (h) => { await pg.goto(B + '#' + h); await pg.waitForTimeout(350); };
const shot = (n, full = true) => pg.screenshot({ path: `shots/${n}.png`, fullPage: full });
const ok = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('  ✓', m); };
const gotIt = async () => { const g = pg.locator('.moment button', { hasText: /^(OK|Got it)$/ }); if (await g.count()) await g.first().click({ timeout: 3000 }).catch(() => {}); };
const state = async (pid) => pg.evaluate((id) => JSON.parse(localStorage.getItem('baller-connection-v9')).players.find((p) => p.id === id || p.name === id).state, pid);
const queueMatches = async () => { const chips = (await pg.locator('.chips .chip b').allTextContents()).map(Number); const rows = await pg.locator('.queue .qrow').count(); return chips[0] === rows && chips.slice(1).reduce((a, c) => a + c, 0) === rows; };

await go('/'); await pg.evaluate(() => localStorage.clear()); await go('/');
// ---------- site: the method is the promise, the outcome is the reason ----------
ok(/sees your reps between sessions/i.test(await pg.locator('.s-hero h1').innerText()), 'home: hero is the method (a coach who sees your reps between sessions)');
ok(/make practice show up in games/i.test(await pg.locator('.s-hero').innerText()), 'home: the outcome line stays under the hero');
ok((await pg.locator('.s-hero .s-ctas a').first().innerText()).trim() === 'Apply' && /#\/apply$/.test(await pg.locator('.s-hero .s-ctas a').first().getAttribute('href')), 'home: primary CTA is Apply');
ok(/see how it works/i.test(await pg.locator('.s-hero .s-ctas a').nth(1).innerText()), 'home: secondary CTA is See how it works');
ok(await pg.locator('.s-pillar').count() === 3, 'home: three pillars'); ok(await pg.locator('.s-product').count() === 1, 'home: product visual (fictional player)'); await shot('01-home', false); await shot('01b-home-full');
const NOHYPE = /homework|63%|transfer rate|level up|AI[- ](powered|generated|feedback)|powered by AI/i;
ok(!NOHYPE.test(await pg.locator('.s-main').innerText()), 'home: no hype, no unsupported stats, no AI claims');
const IA = [['/how', /week in the life/i, '.s-wk', 6], ['/method', /sees your reps between sessions/i, '.s-pillar', 3], ['/parents', /know it’s working/i, '.s-grid3 .s-card', 6], ['/plans', /honest plans/i, '.s-compare tbody tr', 9], ['/coach-bio', /coach \[your name\]/i, '.note', 2]];
for (const [r, h, sel, n] of IA) { await go(r); ok(h.test(await pg.locator('h1').innerText()) && (await pg.locator(sel).count()) === n && (await pg.locator('.s-nav a.active').count()) === 1, `${r}: page renders with its content and active nav`); ok(!NOHYPE.test(await pg.locator('.s-main').innerText()), `${r}: copy has no hype or unsupported stats`); }
await go('/plans'); ok((await pg.locator('#faq .s-faq').count()) >= 6, 'plans: FAQ beside the comparison'); ok(await pg.locator('.s-fit h3').count() === 2 && /Not a fit/.test(await pg.locator('.s-fit').innerText()), 'plans: an honest “Good fit / not a fit”'); await shot('02-plans', false);
await go('/parents'); ok(/What this means this week/i.test(await pg.locator('.s-main').innerText()) && /No alert for every clip/.test(await pg.locator('.s-main').innerText()), 'parents: one sentence a week, no per-clip alerts by default');
await go('/how'); await shot('02-how-it-works', false); await go('/parents'); await shot('03-for-parents', false); await go('/method'); await shot('03b-method', false);
await go('/coach-bio'); ok(/placeholder/i.test(await pg.locator('.s-main').innerText()), 'coach bio is clearly marked as a placeholder');
await go('/definitely-not-a-page'); ok(/this page isn’t here/i.test(await pg.locator('h1').innerText()) && (await pg.locator('.s-404 a').count()) >= 3, '404 page with ways back');
ok((await pg.locator('.s-foot nav a').count()) >= 10, 'consistent footer with every route');

// Google sign-in (demo: simulated chooser running the same linking rules as the server)
await go('/login'); await pg.getByRole('button', { name: 'Continue with Google' }).click(); await pg.waitForTimeout(300); ok(/\/google/.test(pg.url()), 'Google button opens the (simulated) chooser'); await shot('04-google-sim', false);
await pg.getByRole('button', { name: /Someone new/ }).click(); ok(/no Baller Connection account/.test(await pg.locator('#google-msg').innerText()), 'Google: unknown email is refused (no open signup)');
await pg.getByRole('button', { name: /Unverified email/ }).click(); ok(/isn’t verified/.test(await pg.locator('#google-msg').innerText()), 'Google: unverified email refused');
await pg.getByRole('button', { name: /dana@demo\.test/ }).first().click(); await pg.waitForTimeout(400); ok(/#\/parent/.test(pg.url()), 'Google: invited parent signs in and lands on the parent view');


// Apply: seven questions, the last one in the player's own words
await go('/apply'); await pg.fill('#pn', 'Casey Rowan'); await pg.fill('#pp', 'Pat Rowan'); await pg.fill('#pe', 'pat@demo.test'); await pg.getByRole('button', { name: 'Continue' }).click();
for (const t of ['13–14', '3–4 days', 'Both of us', 'Plan + regular feedback']) { await pg.getByRole('radio', { name: t }).click(); await pg.waitForTimeout(220); }
await pg.fill('#t', 'Make the 8th-grade A team'); await pg.getByRole('button', { name: 'Continue' }).click(); ok(/in your own words/i.test(await pg.locator('#qh').innerText()), 'apply: the last question is for the player, in their own words');
await pg.fill('#t', 'Stop turning it over when they press me'); await pg.getByRole('button', { name: 'See my result' }).click();
await pg.locator('.suggest').getByText('Development').waitFor(); ok(/Good fit \/ not a fit/.test(await pg.locator('.fitlist').innerText()), 'apply: result includes an honest good fit / not a fit'); await shot('03-apply-result', false);
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
ok(await pg.evaluate(() => JSON.parse(localStorage.getItem('baller-connection-v9')).outbox.some((m) => m.to === 'pat@demo.test' && m.kind === 'invite')), 'invite email queued to the outbox');
await pg.locator('.demobar').getByRole('button', { name: 'Head coach' }).click(); await pg.waitForTimeout(300);
await go('/coach'); ok(await pg.locator('.capacity').innerText().then((t) => /6\/15/.test(t)), 'capacity meter shows 6/15');


// A parent-only application is flagged for the coach, not rejected
await go('/apply'); await pg.fill('#pn', 'Drew Hollis'); await pg.fill('#pp', 'Sam Hollis'); await pg.fill('#pe', 'sam.h@demo.test'); await pg.getByRole('button', { name: 'Continue' }).click();
for (const t of ['13–14', '3–4 days', 'Mostly mine (parent)', 'Plan + regular feedback']) { await pg.getByRole('radio', { name: t }).click(); await pg.waitForTimeout(220); }
await pg.fill('#t', 'Be more confident'); await pg.getByRole('button', { name: 'Continue' }).click(); await pg.fill('#t', 'idk'); await pg.getByRole('button', { name: 'See my result' }).click(); await pg.getByRole('button', { name: 'Submit application' }).click(); await pg.getByText('Application in').waitFor();
ok(await pg.evaluate(() => JSON.parse(localStorage.getItem('baller-connection-v9')).notifications.some((n) => n.type === 'new_application' && /Not a no/.test(n.text))), 'parent-only application → flagged “Not a no, worth a conversation” (not rejected)');

// Onboarding Theo
await go('/invite'); await pg.fill('#ic', '246810'); await pg.fill('#ipn', 'Morgan Banks'); await pg.fill('#ie', 'morgan@demo.test'); await pg.getByRole('button', { name: /Accept invite/ }).click(); await pg.waitForTimeout(400); ok(await state('theo') === 'Onboarding', 'Invited → Onboarding (backup code)');
ok(await pg.getByRole('button', { name: 'Continue', exact: true }).isDisabled(), 'onboarding can’t start before payment'); await shot('46-welcome-pay', false);
await pg.getByRole('radio', { name: /Development/ }).click(); await pg.getByRole('button', { name: 'Continue to secure checkout' }).click(); await pg.waitForURL(/#\/checkout/); ok(/TEST MODE/i.test(await pg.locator('main').innerText()), 'checkout simulator is clearly test mode'); await shot('47-checkout-sim', false);
await pg.fill('#cc', '4000 0000 0000 0002'); await pg.getByRole('button', { name: /Subscribe/ }).click(); await pg.getByText(/card was declined/).waitFor(); ok(await state('theo') === 'Onboarding', 'declined test card: nothing changes');
await pg.fill('#cc', '4242 4242 4242 4242'); await pg.getByRole('button', { name: /Subscribe/ }).click(); await pg.waitForURL(/#\/welcome/); await pg.waitForTimeout(400);
ok(await pg.evaluate(() => { const s = JSON.parse(localStorage.getItem('baller-connection-v9')); const t = s.players.find((p) => p.id === 'theo'); return t.billing === 'paid' && t.tier === 'Development' && s.outbox.some((m) => m.kind === 'payment-receipt' && m.to === 'morgan@demo.test'); }), 'checkout → paid on Development + receipt email');
// meet your coach comes first, in his own words
ok(/Meet /i.test(await pg.locator('.flowbody h1').innerText()) && await pg.locator('.meetcoach').count() === 1 && /How I work/.test(await pg.locator('.meetcoach').innerText()), 'onboarding: meet your coach, in his own words'); await shot('05a-meet-your-coach', false);
await pg.getByRole('button', { name: 'Continue' }).click();
await pg.getByRole('radio', { name: 'Guard' }).click(); await pg.getByRole('button', { name: 'Continue' }).click();
await pg.fill('#g', 'Make the travel team'); await pg.fill('#mine', 'Stop getting the ball stolen'); await pg.fill('#pr', 'My crossover'); await pg.fill('#fr', 'Getting the ball stolen'); await pg.getByRole('button', { name: 'Continue' }).click();
await pg.getByRole('radio', { name: 'Watch, then try' }).click(); await pg.getByRole('button', { name: 'Continue' }).click();
// rhythm: an agreed pace
await pg.getByRole('radiogroup', { name: 'Clips per week' }).getByRole('radio', { name: '2', exact: true }).click(); await pg.getByRole('radiogroup', { name: 'Clip day' }).getByRole('radio', { name: 'Thu' }).click(); await shot('05b-rhythm', false); await pg.getByRole('button', { name: 'Continue' }).click();
// roles agreement is required
ok(/Who does what/i.test(await pg.locator('.flowbody').innerText()) && await pg.getByRole('button', { name: 'Continue' }).isDisabled(), 'onboarding: roles agreement must be ticked'); await shot('05c-roles', false); await pg.getByRole('checkbox').check(); await pg.getByRole('button', { name: 'Continue' }).click();
await pg.fill('#gn', 'Morgan Banks'); await pg.getByRole('checkbox').check(); await pg.getByRole('button', { name: /Agree & finish/ }).click();
await pg.getByText('Welcome, Theo.').waitFor(); ok(await state('theo') === 'Plan building', 'Onboarding → Plan building'); await shot('05-welcome', false);
ok(await pg.evaluate(() => { const t = JSON.parse(localStorage.getItem('baller-connection-v9')).players.find((p) => p.id === 'theo'); return t.rhythmPlan?.repsPerWeek === 2 && t.rhythmPlan?.clipDay === 'Thursday' && !!t.agreement; }), 'rhythm and the roles agreement are saved');

// Player sees the first look is coming, and can send an intake clip now
await go('/app?p=theo'); await gotIt(); ok(await pg.locator('#rep').innerText().then((t) => /looking at how you play/i.test(t)), 'Today: first look in progress'); ok(/Hi Theo!/i.test(await pg.locator('.hello').innerText()), 'Today greeting is age-appropriate (Theo is 11)');
await pg.setInputFiles('#clipfile', 'tests/fixtures/short-4s.mp4'); await pg.locator('.clipchosen').waitFor(); await pg.getByRole('button', { name: 'Send clip' }).click(); await pg.waitForTimeout(400); ok(/1 clip sent/.test(await pg.locator('#intake').innerText()), 'intake clip sent while the coach gets to them'); await shot('06a-intake-clip', false);
ok(await pg.locator('#stuck-btn').count() === 1, '“I’m stuck” is on every player screen');

// Coach: first look. The plan can’t publish until the coach writes what he saw
await go('/coach/plan/theo'); await pg.fill('#fo', 'Eyes-up dribbling'); await pg.getByRole('button', { name: /Two-ball pound/ }).click(); ok(await pg.getByRole('button', { name: 'Send first look + plan' }).isDisabled(), 'first plan is refused until the coach says what he saw');
await pg.fill('#saw', 'Quick hands and a good first step. When the defender closes in, your eyes drop to the ball.'); await pg.locator('#firstlook').screenshot({ path: 'shots/06-coach-first-look.png' });
await pg.getByRole('button', { name: 'Send first look + plan' }).click(); await gotIt(); ok(await state('theo') === 'Plan set', 'Plan building → Plan set (first look sent)');

// Player reads the coach's own words first
await go('/app?p=theo'); ok(/Quick hands and a good first step/.test(await pg.locator('.firstlook').innerText()), 'player sees what the coach saw in them, in his words');
await shot('06b-first-look-player', false); await pg.getByRole('button', { name: /Read my focus/ }).click(); await gotIt(); ok(await state('theo') === 'Work ready', 'Plan set → Work ready');

// Rep: clip first, one honest sentence, a sets stepper
await pg.locator('#sets-n').waitFor(); const n0 = Number((await pg.locator('#sets-n').innerText()).match(/^(\d+) of (\d+)/)?.[1]); ok(n0 >= 2 && new RegExp(`^${n0} of ${n0}$`).test((await pg.locator('#sets-n').innerText()).trim()), 'check-in: a sets stepper that starts at all sets (no per-set tapping)'); await pg.getByRole('button', { name: 'One fewer set' }).click(); ok(new RegExp(`^${n0 - 1} of ${n0}$`).test((await pg.locator('#sets-n').innerText()).trim()), 'stepper changes the sets');
ok(await pg.getByRole('button', { name: 'Send to my coach' }).isDisabled(), '“Send to my coach” waits for one honest sentence');
await pg.fill('#refl', 'Kept my eyes up for most of the sets.');
await pg.setInputFiles('#clipfile', 'tests/fixtures/long-35s.mp4'); await pg.locator('[data-clip="error"]').waitFor(); ok(/35 s.*30 s max/.test(await pg.locator('[data-clip="error"]').innerText()) && await pg.locator('[data-clip="trim"]').count() === 1, 'clip > 30 s refused client-side with a trim hint'); await shot('41-clip-too-long', false);
await pg.setInputFiles('#clipfile', 'tests/fixtures/short-4s.mp4'); await pg.locator('.clipchosen').waitFor(); ok(/Clip ready · 4 s/.test(await pg.locator('.clipchosen').innerText()), 'short clip accepted (duration read from video metadata)');
await pg.fill('#watch', 'My eyes on the crossover'); await gotIt(); await shot('07-player-today-checkin');
await pg.getByRole('button', { name: 'Send to my coach' }).click(); await pg.locator('.moment').waitFor(); await pg.waitForTimeout(500);
const m = await pg.locator('.moment').innerText(); ok(/Sent to your coach/i.test(m) && /What’s next/i.test(m) && !/level up|confetti/i.test(m), 'calm “sent” confirmation with what’s next (no level-up fanfare)'); await shot('08-moment-sent', false);
await pg.locator('.moment .btn.ghost').click(); ok(await state('theo') === 'Submitted', 'Work ready → Submitted');
ok(await pg.locator('.sla-clock').count() === 1, 'Today shows coach reply-by clock'); ok(/4 s clip/.test(await pg.locator('#rep').innerText()), 'Today shows the clip went with the check-in');
ok(await pg.evaluate(() => { const s = JSON.parse(localStorage.getItem('baller-connection-v9')); const sub = s.submissions.filter((x) => x.playerId === 'theo').at(-1); return !!sub.clipId && s.clips.find((c) => c.id === sub.clipId)?.watchFor === 'My eyes on the crossover'; }), 'submission carries the clip + what-to-watch-for note');

// Coach reviews: Theo's clip (last rep → re-check), retry Riley
await go('/coach/review/theo'); const rv = await pg.locator('.review').innerText(); ok(/Show-me/.test(rv) && /In their words: Stop getting the ball stolen/.test(rv), 'review panel: learning-style template + the player’s own words from setup');
ok((await pg.getAttribute('#f-adjust', 'placeholder')).startsWith('Watch:'), 'feedback template adapts to “Watch, then try”');
await pg.locator('.clipplayer video').waitFor(); await pg.waitForFunction(() => document.querySelector('.clipplayer video')?.readyState >= 1); ok(/My eyes on the crossover/.test(await pg.locator('.rv-left').innerText()), 'coach sees the clip inline with the player’s watch-for note');
await pg.getByRole('button', { name: '0.5×' }).click(); ok(await pg.evaluate(() => document.querySelector('.clipplayer video').playbackRate) === 0.5, 'clip plays at 0.5×');
await pg.evaluate(() => { document.querySelector('.clipplayer video').currentTime = 2; }); await pg.waitForTimeout(250); await pg.keyboard.press('k'); await pg.waitForTimeout(150); const ct = await pg.evaluate(() => document.querySelector('.clipplayer video').currentTime); ok(ct > 2 && ct < 2.1, 'K steps one frame forward');
await pg.locator('#addnote').click(); await pg.locator('.tnote-edit input').first().fill('eyes drop on the cross'); ok(/0:02/.test(await pg.locator('.tnote-edit').innerText()), 'tap-to-timestamp note at 0:02');
ok(/⏱ \d:\d\d/.test(await pg.locator('.rtimer').innerText()), 'review timer visible');
await pg.fill('#f-wentWell', 'Eyes up all four sets'); await pg.getByRole('button', { name: /\+ Focus: Eyes-up dribbling/ }).click(); await pg.fill('#f-adjust', 'Watch the rim, then add speed'); await pg.fill('#f-why', 'Eyes up is how you make the travel team'); await shot('09-coach-review', false);
await pg.locator('#f-why').focus(); await pg.keyboard.press('Control+Enter'); await pg.waitForTimeout(400); await gotIt(); ok(await state('theo') === 'Next step ready', 'Ctrl+Enter sends: Submitted → Next step ready');
ok(await pg.evaluate(() => { const r = JSON.parse(localStorage.getItem('baller-connection-v9')).reviews.filter((x) => x.playerId === 'theo').at(-1); return r.notes?.[0]?.t === 2 && /eyes drop/.test(r.notes[0].text) && r.secondsSpent > 0; }), 'timestamp note + review time saved with the feedback');
// The player says it back in their own words (optional, never blocks the next rep)
await go('/app?p=theo'); const rep = await pg.locator('#rep').innerText(); ok(/What you did well/i.test(rep) && /One thing to work on/i.test(rep) && /Watch the rim, then add speed/i.test(rep) && /0:02/.test(rep), 'player sees one adjustment, why, next rep and the clip note');
ok(await pg.locator('#focus[data-ack="none"]').count() === 1 && await pg.locator('#teachback').count() === 1 && /In your words/i.test(await pg.locator('#teachback').innerText()), 'teach-back prompt replaces tap-to-confirm'); ok(await pg.locator('#tb-skip').count() === 1, 'teach-back is optional: “Skip for now” is there'); await pg.locator('#focus').screenshot({ path: 'shots/42-player-teach-back.png' });
await pg.fill('#tb-change', 'ok'); ok(await pg.locator('#tb-send').isDisabled(), 'too-short teach-back can’t be sent');
await pg.fill('#tb-change', 'Look at the rim before I add speed, not at the ball.'); await pg.fill('#tb-notice', 'I lose it less on the crossover'); await pg.locator('#tb-send').click(); await pg.waitForTimeout(400); await gotIt();
ok(await state('theo') === 'Cycle review', 'teach-back sent → next step opens (last rep → re-check)');
ok(await pg.evaluate(() => JSON.parse(localStorage.getItem('baller-connection-v9')).reviews.filter((x) => x.playerId === 'theo').at(-1).teachBack?.change.startsWith('Look at the rim')), 'the player’s own words are stored with the feedback');
await go('/coach'); ok(await pg.locator('.qrow', { hasText: 'Theo Banks' }).filter({ hasText: 'Teach-back' }).count() === 1, 'coach queue: Teach-back to read'); await shot('42b-coach-teachback-queue', false);
await go('/coach/player/theo?tab=feedback'); ok(/Look at the rim before I add speed/.test(await pg.locator('main').innerText()), 'coach reads the player’s words'); await pg.locator('#tb-got').click(); await pg.waitForTimeout(300);
ok(await pg.evaluate(() => { const s = JSON.parse(localStorage.getItem('baller-connection-v9')); return s.reviews.filter((x) => x.playerId === 'theo').at(-1).teachBack.mark === 'got-it'; }), 'coach marks “got it” (the player’s notification is covered in v9.test.ts)');
// Clarify path (Avery's seeded teach-back): the coach asks, the player replies in a short thread
await go('/coach/player/avery?tab=feedback'); await pg.locator('#tb-clar').click(); await pg.locator('input[id^="tbn-"]').fill('Which hand are you keeping low? Say it once more.'); await pg.locator('.tback.coach').getByRole('button', { name: 'Send' }).click(); await pg.waitForTimeout(300);
await go('/app?p=avery'); ok(await pg.locator('#teachback[data-mark="clarify"]').count() === 1 && /wants to clarify/i.test(await pg.locator('#teachback').innerText()), 'player sees “let’s clarify” and the coach’s question'); await pg.fill('#tbreply', 'My left. Keep it below my knee through contact.'); await pg.getByRole('button', { name: 'Send', exact: true }).click(); await pg.waitForTimeout(300);
ok(await pg.evaluate(() => JSON.parse(localStorage.getItem('baller-connection-v9')).messages.filter((m) => m.context === 'feedback' && m.refId === 'r_av2').length >= 2), 'clarify opens a short thread linked to the feedback'); await shot('42c-clarify-thread', false);
// Re-check: player then coach
await go('/app/develop?p=theo'); await pg.fill('#ci', 'Eyes up most of the time'); await pg.fill('#ch', 'Speed'); await pg.fill('#cw', 'Faster dribbling'); await shot('36-player-cycle-review'); await pg.getByRole('button', { name: 'Submit to coach' }).click(); await gotIt();
await go('/coach'); ok(await pg.locator('.qrow', { hasText: 'Theo Banks' }).filter({ hasText: /Re-check/ }).count() >= 1, 're-check appears in the coach queue');
await go('/coach/cycle/theo'); ok(/Eyes up most of the time/.test(await pg.locator('main').innerText()), 'coach sees the player’s re-check answers'); await pg.getByRole('button', { name: 'Raise Ball security' }).click(); await pg.fill('#cs', 'Eyes up is a habit now.'); await shot('37-coach-cycle-review');
await pg.getByRole('button', { name: /Complete review/ }).click(); await gotIt(); ok(await pg.inputValue('#fo') === 'Faster dribbling', 'next focus carries into the plan builder');
ok(await pg.evaluate(() => JSON.parse(localStorage.getItem('baller-connection-v9')).cycleReviews.some((c) => c.playerId === 'theo' && c.ratingsAfter['Ball security'] === 2)), 'skills re-rated at the re-check');
await pg.locator('.demobar').getByRole('button', { name: 'Assistant' }).click(); await pg.waitForTimeout(300);
await go('/coach/review/riley'); await pg.fill('#f-wentWell', 'Good hands on the catch.'); await pg.fill('#f-adjust', 'Set your feet before the catch.'); await pg.fill('#f-why', 'Balanced feet make the shot repeatable.'); await pg.getByRole('button', { name: /Same rep again/ }).click(); await gotIt();
ok(await state('riley') === 'Sign-off', 'assistant review → Sign-off (head coach sign-off required)');
await pg.locator('.demobar').getByRole('button', { name: 'Head coach' }).click(); await pg.waitForTimeout(300);
await go('/coach/review/riley'); await pg.getByRole('button', { name: /^Sign off/ }).click(); await gotIt();
ok(await state('riley') === 'Work ready', 'head sign-off → Work ready (same rep again)');
await go('/app?p=riley'); ok(/Same rep again, with/i.test(await pg.locator('#rep').innerText()), 'player sees the same rep again, with the adjustment');
ok(await pg.locator('#focus').count() === 1 && await pg.locator('#refl').count() === 1 && await pg.locator('#tb-skip').count() === 0, 'retry: the rep is on Today with the adjustment pinned (nothing to tap first)');
// A question on feedback → thread + queue item (Nia, assistant's player)
await go('/app?p=nia'); await pg.locator('#ack-q').click(); await pg.fill('#ackq', 'Same tempo on the left too?'); await pg.getByRole('button', { name: 'Send question' }).click(); await pg.waitForTimeout(300); ok(/Question sent/.test(await pg.locator('#focus').innerText()), '“I have a question first” on the focus card');
ok(await pg.evaluate(() => JSON.parse(localStorage.getItem('baller-connection-v9')).messages.some((m) => m.context === 'feedback' && m.refId === 'r_ni2' && m.dueBy)), 'question creates a feedback-linked message with a reply-by');
await go('/app/inbox?p=nia'); ok(/Feedback: /.test(await pg.locator('.ulist').innerText()), 'player inbox shows the feedback thread'); await shot('38-player-inbox');
await pg.locator('.demobar').getByRole('button', { name: 'Assistant' }).click(); await pg.waitForTimeout(300); await go('/coach'); ok(await pg.locator('.qrow', { hasText: 'Nia Fable' }).filter({ hasText: 'On your feedback' }).count() === 1, 'question → Reply needed in the assigned coach’s queue');

// Promise card updates when the coach keeps a promise
await go('/parent?p=nia'); ok(/Being handled/i.test(await pg.locator('[data-promise="monthly-video"]').innerText()), 'promise card: monthly video check-in at risk'); await shot('39-parent-promises');
await go('/coach/player/nia'); ok(await pg.locator('.riskbox').count() === 1, 'coach sees promise risk on the profile'); const soon = new Date(Date.now() + 2 * 864e5); soon.setMinutes(soon.getMinutes() - soon.getTimezoneOffset()); await pg.fill('#sw', soon.toISOString().slice(0, 16)); await pg.getByRole('button', { name: 'Schedule' }).click(); await pg.waitForTimeout(300);
await go('/parent?p=nia'); ok(/On track/i.test(await pg.locator('[data-promise="monthly-video"]').innerText()), 'promise card updates to On track after the check-in is booked');
await pg.locator('.demobar').getByRole('button', { name: 'Head coach' }).click(); await pg.waitForTimeout(300);

// Clock + SLA escalation, messages
await go('/app/messages?p=avery'); await pg.fill('#nm', 'Can I do extra sets on Saturday?'); await pg.getByRole('button', { name: 'Send' }).click(); await pg.waitForTimeout(300); ok(/Coach replies by/.test(await pg.locator('.uthread').innerText()), 'message shows its expected reply time');
await go('/coach'); ok(await pg.locator('.qrow', { hasText: 'Avery Pine' }).filter({ hasText: /extra sets/ }).count() === 1, 'player message → Reply needed');
await pg.getByRole('button', { name: /\+1 day/ }).click(); await pg.waitForTimeout(300); await gotIt(); ok(await queueMatches(), 'queue counts equal rows after +1 day');
const kinds = await pg.locator('.queue .qrow').evaluateAll((els) => els.map((e) => e.classList.contains('overdue'))); ok(kinds.indexOf(false) === -1 || !kinds.slice(kinds.indexOf(false)).includes(true), 'overdue items ranked first');
await go('/coach'); await pg.locator('.qrow', { hasText: 'Avery Pine' }).filter({ hasText: /extra sets/ }).click(); await pg.waitForTimeout(300); await shot('40-coach-thread', false); await pg.fill('#msg', 'Yes, two extra sets.'); await pg.getByRole('button', { name: 'Send' }).click();
await go('/coach'); ok(await pg.locator('.qrow', { hasText: 'Avery Pine' }).filter({ hasText: /extra sets/ }).count() === 0, 'coach reply clears Reply needed');
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


// ---------- v9: session note, stuck, rough week, game note, parent week, show-me-again, optional streaks, card ----------
await go('/'); await pg.evaluate(() => localStorage.clear()); await go('/');
const S9 = () => pg.evaluate(() => JSON.parse(localStorage.getItem('baller-connection-v9')));
// Defaults: no streaks or points for anyone
await go('/app?p=avery'); ok(await pg.locator('#habits').count() === 0 && !/Level \d/.test(await pg.locator('.hello').innerText()), 'streaks, levels and habits are off by default');
// In-person session note → next focus, shown as “From your session on …”
await pg.locator('.demobar').getByRole('button', { name: 'Head coach' }).click(); await go('/coach/player/avery'); await pg.fill('#ses-note', 'Great hands today. Dropped the ball on contact twice.'); await pg.fill('#ses-focus', 'Left hand low through contact'); await pg.fill('#ses-cue', 'Two hands to the chest'); await shot('55-coach-session-note', false); await pg.locator('#ses-save').click(); await pg.waitForTimeout(300);
ok((await S9()).cycles.some((c) => c.playerId === 'avery' && c.status === 'active' && c.focus === 'Left hand low through contact'), 'session note sets the active focus');
await go('/app?p=avery'); ok(/^From your session on [A-Z][a-z]{2}/i.test((await pg.locator('#session .kicker').innerText()).trim()) && /Left hand low through contact/.test(await pg.locator('#session').innerText()), 'player sees “From your session on …” with the focus'); await pg.locator('#session').screenshot({ path: 'shots/56-player-from-session.png' });
// Meet your coach: edit the intro in Settings, families see it
await go('/coach/settings'); await pg.fill('#cp-intro', 'I coach 11 to 15 year olds in the gym every week. This is how I stay with you after we leave.'); await pg.getByRole('button', { name: 'Save settings' }).click(); await pg.waitForTimeout(300); await go('/app/develop?p=avery'); ok(/stay with you after we leave/.test(await pg.locator('.meetcoach').innerText()), 'coach profile edits show on “Meet your coach”');
// “I'm stuck” → private note → coach reply (parent never sees it)
await go('/app?p=avery'); await pg.locator('#stuck-btn').click(); ok(await pg.locator('#stuck-send').isDisabled() && /writes back|reply/i.test(await pg.locator('#stuck-promise').innerText()), 'stuck: three gentle prompts and a promised reply window'); await pg.fill('#st-happened', 'Lost the ball three times in a row at open gym'); await pg.waitForTimeout(700); await shot('57-player-stuck', false); await pg.locator('#stuck-send').click(); await pg.waitForTimeout(300);
ok(/Only .* sees this/.test(await pg.locator('.moment').innerText()), 'stuck: sent privately, with a reply-by'); await pg.getByRole('button', { name: 'Close' }).click();
await go('/parent?p=avery'); ok(!/Lost the ball three times/.test(await pg.locator('main').innerText()), 'the parent never sees the stuck note');
await go('/coach'); const chk = pg.locator('.qrow', { hasText: 'Avery Pine' }).filter({ hasText: 'Check in' }); ok(await chk.count() >= 1, 'coach queue: a private “Check in” item for the stuck note'); await shot('58-coach-queue', false);
await chk.first().click(); await pg.waitForTimeout(300); await pg.fill('#msg', 'Thanks for telling me. Everyone has those. Thursday we just do form shots.'); await pg.getByRole('button', { name: 'Send' }).click(); await pg.waitForTimeout(300);
await go('/coach'); ok(await pg.locator('.qrow', { hasText: 'Avery Pine' }).filter({ hasText: 'Check in' }).count() === 0, 'the coach’s own reply clears the stuck item');
// Rough week: light week / reset / talk to my coach, no lecture (Nia)
await pg.locator('.demobar').getByRole('button', { name: 'Player' }).click(); await go('/app?p=nia'); await pg.locator('#rough summary').click(); ok(await pg.locator('#rough-light').count() === 1 && await pg.locator('#rough-reset').count() === 1 && await pg.locator('#rough-talk').count() === 1, 'rough week offers three ways forward'); await pg.locator('#rough').screenshot({ path: 'shots/59-player-rough-week.png' });
await pg.fill('#rough-note', 'Tests all week'); await pg.locator('#rough-talk').click(); await pg.waitForTimeout(300); ok(/You picked a talk with your coach/i.test(await pg.locator('#rough').innerText()) && /Nothing to make up/i.test(await pg.locator('#rough').innerText()), 'rough week: chosen, nothing to make up');
ok(await pg.evaluate(() => { const s = JSON.parse(localStorage.getItem('baller-connection-v9')); return s.messages.some((m) => m.playerId === 'nia' && m.context === 'checkin' && m.from === 'player') && s.notifications.some((n) => n.type === 'stuck'); }), '“talk to my coach” → a private check-in for the coach');
// Game note → coach marks “carried over” → player and parent see it
await go('/app/games?p=avery'); ok(await pg.locator('#gamelog').innerText().then((t) => /What carried over/i.test(t) && !/transfer rate|%/i.test(t)), 'game note asks what carried over (no rate)');
await pg.fill('#g-carried', 'Kept my left hand low on two drives and finished one through contact.'); await pg.fill('#g-missed', 'Panicked against the trap.'); await pg.getByRole('radio').nth(2).click(); await pg.locator('#g-send').click(); await pg.waitForTimeout(300);
ok((await S9()).games.some((g) => g.playerId === 'avery' && /left hand low on two drives/.test(g.carried ?? '')), 'game note saved'); await pg.locator('#gamelog').screenshot({ path: 'shots/60-player-game-note.png' });
await pg.locator('.demobar').getByRole('button', { name: 'Head coach' }).click(); await go('/coach/player/avery?tab=games'); await pg.locator('[id^="mark-carried-"]').first().click(); await pg.waitForTimeout(300);
ok((await S9()).games.some((g) => g.playerId === 'avery' && g.mark === 'carried'), 'coach marks the game note “carried over”'); await shot('61-coach-game-mark', false);
await go('/app/games?p=avery'); ok(/Carried over/.test(await pg.locator('#games').innerText()), 'player sees the coach’s mark'); await go('/parent?p=avery'); ok(/Carried over/.test(await pg.locator('#games').innerText()) && !/%/.test(await pg.locator('#games').innerText()), 'parent sees the mark, no percentage');
// “Show me again”: the same drill on a date, as the next rep
await go('/coach/player/avery'); await pg.locator('#probe-drill').selectOption({ index: 1 }); await pg.locator('#probe-send').click(); await pg.waitForTimeout(300); ok(/Requested:/.test(await pg.locator('#probe').innerText()), 'coach asks to see a drill again on a date');
// What a parent sees: one sentence, three tips; the coach’s own sentence wins
await go('/coach/player/avery'); await pg.fill('#pnote', 'Avery is learning to keep the left hand low through contact. Ask about the rep, not the result.'); await pg.locator('#pnote-save').click(); await pg.waitForTimeout(300);
await go('/parent?p=avery'); ok(await pg.locator('#parentweek [data-by="coach"]').count() === 1 && /left hand low/.test(await pg.locator('#parentweek').innerText()) && await pg.locator('#parentweek .tips li').count() === 3, 'parent: one sentence from the coach plus three do/skip tips'); await pg.locator('#parentweek').screenshot({ path: 'shots/62-parent-week.png' });
ok(await pg.locator('#roles').count() === 1 && /What stays private/.test(await pg.locator('#roles').innerText()), 'parent: roles and what stays private'); ok(await pg.locator('#parentcopy').isChecked() === false, 'parent: per-clip notifications are off by default');
await pg.locator('#parentcopy').check(); await pg.waitForTimeout(300); ok((await S9()).users.find((u) => u.id === 'u_dana')?.prefs?.parentCopy === true, 'parent can opt in to per-clip notifications'); await pg.locator('#roles').screenshot({ path: 'shots/63-parent-roles.png' });
// Since week 1: two clips side by side with a coach note
await go('/app/progress?p=avery'); ok(await pg.locator('#since .sidebyside figure').count() === 2, 'progress: week 1 beside now (two clips)'); await pg.locator('#since').screenshot({ path: 'shots/64-since-week1.png' });
// Streaks and points are opt-in
await pg.locator('#gamify-on').check(); await pg.waitForTimeout(300); await go('/app?p=avery'); ok(await pg.locator('#habits').count() === 1, 'streaks and habits appear only after the player turns them on'); await go('/app/progress?p=avery'); await pg.locator('#gamify-on').uncheck(); await pg.waitForTimeout(200);
// Shooting log on a rep (5-spot court) → coach review
await go('/app?p=avery'); await pg.locator('.shotlog').evaluate((d) => { d.open = true; }); const shotTap = async (spot, makes, misses) => { await pg.locator(`.spot[data-spot="${spot}"]`).click(); for (let i = 0; i < makes; i++) await pg.getByRole('button', { name: '✓ Make' }).click(); for (let i = 0; i < misses; i++) await pg.getByRole('button', { name: '✗ Miss' }).click(); };
await shotTap(0, 3, 2); await shotTap(1, 2, 3); await shotTap(3, 4, 1); ok(/4\/5/.test(await pg.locator('.spot[data-spot="3"]').textContent()), 'tap court: 4/5 at right wing'); await pg.locator('.shotcourt').screenshot({ path: 'shots/65-shot-court.png' });
await pg.fill('#refl', 'Right wing felt automatic, left wing short.'); await pg.getByRole('button', { name: 'Send to my coach' }).click(); await pg.waitForTimeout(300); await gotIt();
const sv = (await S9()).submissions.filter((x) => x.playerId === 'avery').at(-1); ok(JSON.stringify(sv.shots) === JSON.stringify([[3, 5], [2, 5], [0, 0], [4, 5], [0, 0]]), 'shooting log saved with the check-in');
await pg.locator('.demobar').getByRole('button', { name: 'Head coach' }).click(); await go('/coach/review/avery'); ok(/9\/15 \(60%\).*best spot: Right wing 80%/i.test(await pg.locator('.shotsum').innerText()), 'coach review shows makes and best spot'); await pg.locator('.shotsum').screenshot({ path: 'shots/66-review-shots.png' });
// Player Card: private by default, parent controls the link, never any stats
await go('/parent?p=avery'); ok(await pg.locator('#card input[aria-label="Card link"]').count() === 0, 'card is private by default (no link)'); await pg.locator('#card-on').check(); await pg.waitForTimeout(200);
const link = await pg.locator('#card input[aria-label="Card link"]').inputValue(); ok(/#\/card\/[a-f0-9]{32}$/.test(link), 'parent turns on a private link'); await pg.locator('#card').screenshot({ path: 'shots/67-card-settings.png' });
let pub; const openCard = async () => { await pub?.close(); pub = await b.newPage({ viewport: { width: 520, height: 820 }, storageState: await pg.context().storageState() }); pub.on('pageerror', (e) => errs.push(e.message)); await pub.goto(link); await pub.waitForTimeout(500); };
await openCard(); ok(/Avery P\./i.test(await pub.locator('.pcard').innerText()) && !/pts \/ game|\d+%/i.test(await pub.locator('.pcard').innerText()), 'shared card: last initial only, never any stats'); await pub.screenshot({ path: 'shots/68-public-card.png' });
await pg.locator('#card-on').uncheck(); await pg.waitForTimeout(150); await openCard(); await pub.waitForTimeout(400); ok(await pub.locator('.pcard').count() === 0 && /off or was replaced/i.test(await pub.locator('main').innerText()), 'link off → card no longer shows'); await pub.close();

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

{ const m = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true }); m.on('pageerror', (e) => errs.push(e.message));
  await m.goto(B + '#/'); await m.waitForTimeout(500); await m.screenshot({ path: 'shots/80-mobile-home.png' });
  ok(await m.locator('.s-nav').isHidden() && await m.locator('.s-menu').isVisible(), 'mobile: nav collapses to a menu button');
  await m.locator('.s-menu').click(); await m.waitForTimeout(500); ok((await m.locator('#s-drawer a').count()) >= 6, 'mobile: menu lists every route'); await m.screenshot({ path: 'shots/81-mobile-menu.png' }); await m.locator('.s-menu').click();
  ok(!(await m.locator('.s-mcta').getAttribute('class')).includes('show'), 'mobile: sticky CTA hidden over the hero'); await m.mouse.wheel(0, 1400); await m.waitForTimeout(500);
  ok((await m.locator('.s-mcta').getAttribute('class')).includes('show'), 'mobile: sticky Apply CTA after scrolling'); await m.screenshot({ path: 'shots/82-mobile-pillars.png' });
  for (const [r, n] of [['/plans', '83-mobile-plans'], ['/how', '84-mobile-how'], ['/parents', '85-mobile-parents'], ['/login', '86-mobile-login'], ['/apply', '87-mobile-apply']]) { await m.goto(B + '#' + r); await m.waitForTimeout(450); await m.screenshot({ path: `shots/${n}.png` }); }
  await m.goto(B + '#/app?p=avery'); await m.waitForTimeout(500); await m.screenshot({ path: 'shots/88-mobile-today.png' });
  ok(await m.locator('#stuck-btn').isVisible(), 'mobile: “I’m stuck” is always on the player screen'); ok(await m.locator('.demobar .demomore').isVisible() && await m.locator('.demobar .demotools').isHidden(), 'mobile: demo tools are tucked behind one button');
  await m.locator('.demobar .demomore').click(); await m.waitForTimeout(200); ok(await m.locator('.demobar .demotools').isVisible(), 'mobile: Tools opens the demo controls'); await m.locator('.demobar .demomore').click(); await m.close(); }
const mo = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true }); mo.on('pageerror', (e) => errs.push(e.message));
await mo.goto(B + '#/'); await mo.evaluate(() => localStorage.clear()); await mo.goto(B + '#/app?p=avery'); await mo.waitForTimeout(500); await mo.screenshot({ path: 'shots/16-mobile-today.png', fullPage: true });
await mo.goto(B + '#/'); await mo.waitForTimeout(400); await mo.screenshot({ path: 'shots/17-mobile-home.png' });
await mo.goto(B + '#/coach'); await mo.waitForTimeout(400); await mo.screenshot({ path: 'shots/18-mobile-coach.png', fullPage: true });
if (errs.length) throw new Error(errs.join('\n')); console.log('E2E OK'); await b.close();

