# Baller Connection: positioning (v8)

## The one promise
**Make practice show up in games.**
A coach-led virtual program that gives a player one clear weekly plan, has a real coach read every check-in, and tracks whether the work transfers into games. Confidence goes up as a result.

Why this outcome: most young players work hard. What fails is the transfer from the driveway to the game, and the confidence that goes with it. An app can count reps. Only a coach can say *what to change*, and a game log can show whether it worked. That combination is what we can own.

## Audience
- **Parents of players aged 10–17** (the buyer). They want structure, proof it's working, and a safe, private place for their kid. Their questions: *Is it working? Is someone real paying attention? What does it cost and how do I stop?*
- **Players aged 10–17** (the user). They want to get better and feel ready on game day. Their questions: *What do I do today? Did coach see it? Am I improving?*

## Three pillars
1. **One clear weekly plan.** One focus at a time, the reps for this week on the Today screen, and a pre-game card (focus, cue, the player's own words).
2. **A real coach watching.** A written reply to every reviewed check-in by a deadline you can see. One adjustment, why it matters, and the next rep. Never an AI.
3. **Proof in games.** A one-minute game log after every game: did I try the focus, how confident I felt. A timeline shows practice-to-game transfer and confidence over time, with the coach's own notes.

## Proof points (each is enforced in code; see PROMISES.md)
- Reply-by deadlines per plan: same business day / 1 / 2 business days (`reply-window`). Late items jump the coach's queue (`overdue-first`).
- First plan within 2 business days of onboarding (`first-plan`). A cycle review every 4 weeks (`cycle-review`).
- Every review: one adjustment and the next rep (`one-cue`, `next-rep`). A focus for the week, confirmed by the player (`focus-confirm`).
- Practice-to-game transfer rate and a coach cue when it's low. Confidence dips flagged to the coach (`confidence-check`). One game review a week on request (`game-reply`).
- A one-minute weekly parent summary (`parent-summary`).
- Roster capped at 15, Inner Circle at 4 (`capacity`).
- Privacy: clips only seen by family + assigned coaches, deleted after 90 days (`clip-privacy`). Player Cards private by default (`card-private`). Under-13s sign in with a parent-set PIN.
- No contracts: pause or cancel anytime (`pause-anytime`, `cancel-anytime`).

## What we deliberately don't do
- No full-game film breakdown (short practice clips only, 30 s max).
- No AI coach. A named person writes every plan, review and reply.
- No recruiting promises, rankings or exposure guarantees.
- No in-person or team practice.
- No grades on kids. Confidence is the player's own 1–5 read, and progress uses growth language.
- No open signup. Every family is reviewed for fit and joins by invite.

## Voice
Direct, calm, specific. Short sentences. Numbers instead of adjectives. No hype words ("elite", "unlock your potential", "revolutionary"). Say what happens, who does it, and by when.

## Where this is applied
Landing (hero, pillars, proof), How it works (a week in the life), Method (pillars, rubric, levels), For parents (safety, privacy, the weekly view), Plans (comparison + FAQ), Coach (placeholder bio), Apply, and the in-app copy for Today, Games, Progress and the parent view.
