# Voice

How Baller Connection sounds. It is a coach talking to a player about basketball, with a parent listening in. Not an app talking to a user. Every string a family or coach reads follows this page. `tests/v9.test.ts` and `tests/promises.test.ts` enforce the hard rules (no "homework", no "assignment", no AI-coach claims, no percentages or hype on public pages).

## The one voice
**Warm, direct, respectful.** Say the specific thing. Say it once. Assume the player is capable and the parent is busy. Never scold, never gush, never sell.

| Do | Don't |
|---|---|
| Name the rep: "Left hand low through contact." | "Great job! Keep up the hard work!" |
| Say what you saw, then one thing to change | Three corrections in one message |
| Short sentences, plain words | Jargon, hype, exclamation chains |
| Treat a missed week as information | "You missed your streak." "You're behind." |
| Ask for the player's words | Ask for a tap that proves nothing |
| "Your coach" / "he" (a named person) | "Our AI", "the system", "the platform" |

## By audience

**Player (about 11–15).** Respectful, concrete, not childish. No mascots, no "Level up!", no baby talk, no emoji walls. Never "homework" or "assignment": it is a *rep*, a *focus*, a *clip*, a *next step*. The player is addressed as someone who plays, not someone who is being managed.

**Parent.** Calm and specific. One sentence on what this means this week, then do/don't tips. No alarm, no per-rep pings, no comparison to other players. The parent is a supporter, not the technical coach.

**Coach.** Short. Verbs first: "Reply", "Mark", "Set focus". A queue item says what to do and by when, never why the software is sad.

## Before / after (from this release)

| Where | Before (v8) | After (v9) | Why |
|---|---|---|---|
| Landing hero | "Make practice show up in games." | "A coach who sees your reps between sessions." (outcome line underneath: "Make practice show up in games.") | The method is the product; the outcome is the reason |
| Player confirms a review | Button: "Got it, I'll do this" | "In your words: what will you do differently, and what will you notice?" with "Say it in my words" and "Skip for now" | A tap proves nothing; a sentence tells the coach what landed |
| Logging a rep | "Tap each set" / "Submit to coach" | Clip first, one honest sentence, a sets stepper, "Send to my coach" | Less like a worksheet |
| Progress | "Practice → game 63%" | A game note (what carried over, what didn't), then the coach's mark: carried over / partly / not yet | A percentage from a few self-reports is not evidence |
| A quiet week | "Missed check-in" | "Rough week? A light week, a reset, or a note to your coach. Nothing to make up." | No lecture, no streak at stake |
| Parent digest | "Avery logged 2 check-ins this week, is on a 4-day habit streak, and is at Level 3." | "Avery sent 2 check-ins. This week: keep the left hand low. Ask about the rep, not the result." | One sentence a parent can use at dinner |

## Words we use / avoid
- Use: rep, focus, clip, next step, first look, "say it back", rough week, light week, reset, carried over, "what I saw".
- Avoid on player and parent screens: homework, assignment, task, submit, compliance, streak (unless the player turned streaks on), level, badge, points, "crush it", "grind", "elite", "unlock", "guaranteed", "AI".
- Never claim: film breakdown, AI feedback, a percentage that isn't a count, results, "proven".
- Never clinical: no "anxiety", "depression", "mental health", "therapy". A check-in is "checking in on you, not your reps."

## Coach templates (in the app, edit freely)
These ship as saved replies and check-in starters (`shared/domain.ts`). They are starting points: the coach reads, edits and sends them as himself.

- "Good question. Short answer: yes, same reps, same tempo."
- "Thanks for telling me. Lighten the day before a game and I'll see you next session."
- "Rough week happens. We'll keep it light and pick back up when you're ready. Nothing to make up."
- "Checking in on you, not your reps. How are you feeling about basketball right now?"
- "I saw the clip. One thing carried over from last week: the eyes-up catch. Keep that, and we'll sharpen the next piece."
- Check-in starters: "I noticed it's been a few days. No catching up needed. Want a lighter week, or a reset on the focus?" · "That game sounded tough. One thing I saw you do well last week: [specific]. Want to talk about it?"

## Review format (every written review)
1. What went well (specific).
2. One adjustment.
3. Why it matters.
4. The next rep.

## Missed weeks and rough patches
Say it once, kindly, and give three doors: **light week**, **reset the focus**, **talk to your coach**. The coach is never handed a "chase" list. Streaks and points are off by default; the player or a parent can turn them on.

## Check before you ship a string
1. Could a coach say this out loud to a 13-year-old without wincing?
2. Does it map to a promise in PROMISES.md, or make no promise at all?
3. Would a parent reading it over a shoulder be comfortable?
4. Is there a number? Is it a count of something that happened?
