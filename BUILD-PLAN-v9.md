# Build plan v9: a coach who sees your reps between sessions

Prepared Oct 15, 2026 (CT). Input: `concept-comparison-2026-10-15/Concept-Comparison.md`, scrutinized rather than copied. `v8-final` (tag at db59737) restores the previous version.

## 1. The method (one paragraph)
**A coach who sees your reps between sessions.** The coach picks one focus from what *he* saw (an in-person session, or the intake clip). The player sends one clip of 30 seconds or less. The coach writes back one specific adjustment, in a fixed format: what went well, one adjustment, why, next rep. The player says it back in their own words (optional) and the coach marks it "got it" or opens a short thread to clarify. The next clip shows whether it changed, and every 4 to 6 weeks the coach puts week 1 next to now. A game note (what carried over, what didn't) is the one complement; a coach mark, not a score.

## 2. Who does what
| Role | Does | Doesn't |
|---|---|---|
| **Player** | Picks a rhythm; sends one clip and one honest sentence a week or so; says the adjustment back; writes a one-line game note; presses "I'm stuck" when they are | Log sets for a score; keep a streak (unless they turn it on); answer to a leaderboard |
| **Parent** | Agrees to the roles at onboarding; films a clip when asked; reads one Sunday note ("What this means this week" plus 3 do/don't tips); can opt in to per-clip alerts; owns consent, billing, the private Player Card | Coach the technique; see the player's private "I'm stuck" notes; get per-rep pings by default |
| **Coach** | Writes the first look; sets focus (also from an in-person session note); reviews clips; marks teach-backs; marks game notes carried over / partly / not yet; checks in on a player; asks "show me again" when he wants proof | Chase missed weeks from a list; write to a parent about private notes without telling the player first |

## 3. What changed
**Coach relationship.** Meet-your-coach screen in onboarding (his own words, editable in Settings). First look: the first plan is refused until the coach writes "what I saw", which becomes the first message. In-person session note sets the next focus and shows to the player as "From your session on Tue". The auto-written coach "welcome" is gone because it looked coach-written but wasn't. Saved replies and check-in starters are warm, short, never clinical.

**Teach-back instead of tap-to-confirm.** "In your words: what will you do differently, and what will you notice?" Text only, optional, prompts and examples, next rep never waits. Coach marks got it / let's clarify; clarify opens a thread.

**Accountability that isn't homework.** The player and parent agree a rhythm at onboarding (reps a week, clip day). Missed week: Friday offers "light week / reset / talk to my coach" once, no lecture, nothing to make up. Streaks and points are optional and off by default. Progress is "what's changed since week 1" with side-by-side clips and a coach note. The "transfer rate" % is gone, replaced by the game note and the coach's mark.

**Confidence / struggle.** "I'm stuck" on every player screen: a private note to the coach with three gentle prompts and a reply inside the plan's window. Coach "check in on you" templates. The coach may talk with a parent if something needs a grown-up, and tells the player first (**policy for Keith to confirm**).

**Parent.** One-sentence weekly summary plus three do/don't tips (the coach's own sentence wins when he writes one). Roles agreement at onboarding. Sunday digest and timeline only; per-clip notifications are off unless the parent opts in.

**Fit.** "Good fit / not a fit" on Plans and at the end of Apply. The application asks the *player* for their own words; parent-only applications are flagged for the coach as "Not a no, worth a conversation", not rejected.

**Proof, light.** The clips are the proof. "Show me again" asks the same drill on a date. Spot-check and anti-fake mechanics are removed.

## 4. What I removed, and why (scrutiny of the comparison)
| Removed or hidden | Why |
|---|---|
| Points, levels, badges, confetti; streaks hidden by default | Comparison: not core motivators. The coach seeing reps is the accountability |
| Numeric transfer rate, "63%" | A few self-reports aren't evidence |
| Public Player Card stats (card shows no stats; no link until a parent turns it on) | Comparison: no public or parent-visible comparisons |
| Spot-check / speak-the-cue verification | Anti-fake machinery; replaced by "show me again" |
| Promises: plan-adjust, rubric-cycle, tournament-plan, season-goal-review, focus-confirm, confidence-check, message-reply, game-reply, payment-grace, spot-offer and others (see PROMISES.md) | Admin on a schedule instead of help when it's needed; one reply number per plan |
| Per-rep parent notifications by default | Parents shouldn't be pulled into every rep |
| Mobile demo-bar clutter, unneeded queue item types | Cleaner screens; the queue shows what the coach does next |
| Plans-page rows for rubric, tournament plan, 2-week plan adjustments | Not promises a coach can keep on a schedule |

**Where I disagreed with the comparison, or held back.**
- *Tiering.* The comparison says tiering can wait. I kept the three plans because pricing and billing exist and are dormant. I only differentiated them by reply window, reviews a week and live video, and removed every other row. A pilot could run at one price.
- *Daily check-ins* were already absent; kept it that way (one clip a week is the target).
- *Reply windows* were reduced to one number per plan, not one number overall. Keith should pick numbers he can actually keep.
- *Billing, Stripe, Google sign-in, magic link, Resend* kept as they were, dormant and not expanded. They remain machinery the pilot does not need.
- *Initial segment.* The comparison recommends existing Storm clients first. The app supports both; the in-person session note and first look make the in-person path first-class. Remote players start from an intake clip.

## 5. Hypotheses (untested)
No real family has used this. Everything below is a hypothesis only a pilot can answer.
1. Players aged 11–15 will write a sentence for teach-back (vs skipping it every time).
2. The right number of clips a week is about one, not two or three.
3. Parents want a Sunday note and no per-clip alerts.
4. Side-by-side week 1 vs now feels like progress to a player.
5. The reply windows are ones Keith can keep.
6. The "I'm stuck" button gets used, and the private-thread policy is acceptable to parents.
7. "A coach who sees your reps between sessions" resonates more than the outcome line.
8. The bottleneck is feedback (not consistency or confidence). If it's consistency, the structured-cycle approach wins; the comparison says so too.
9. A short clip can show enough of what matters (mechanics yes; decisions, much less).

## 6. How it's checked
Vitest (`tests/v9.test.ts` plus per-promise enforcement in `tests/promises.test.ts`), Playwright e2e for every flow above on desktop and mobile, copy tests (no hype, no AI-coach claims, no unsupported stats, no "homework"/"assignment"), migration 0010 exercised through sql.js. Nothing is deployed to Cloudflare; the Pages site runs in demo mode with fictional players.
