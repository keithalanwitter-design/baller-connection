import { TIERS, type Tier } from '../../shared/domain';

/** All marketing copy in one place. Every claim maps to a promise id in PROMISES.md (see POSITIONING.md). */
export const PROMISE = 'Make practice show up in games.';
export const SUB = 'A weekly plan, a real coach who reads every check-in, and a one-minute game log that shows whether the work is carrying over. For players 10–17 and the parents behind them.';

export const PILLARS = [
  { k: 'plan', n: '01', t: 'One clear weekly plan', d: 'One focus at a time. This week’s reps wait on the Today screen. On game day, a card with one focus, one cue and a line in the player’s own words.', proof: 'First plan within 2 business days of onboarding.' },
  { k: 'coach', n: '02', t: 'A real coach watching', d: 'Every reviewed check-in gets a written reply: what went well, one adjustment, why it matters, and the next rep. A named person writes it. Never an AI.', proof: 'Every reply has a deadline you can see.' },
  { k: 'proof', n: '03', t: 'Proof in games', d: 'After each game the player logs one minute: did I try my focus, and how confident did I feel? The timeline shows whether practice is turning up in games.', proof: 'Your coach is alerted if confidence dips two games in a row.' },
];

export const WEEK = [
  { d: 'Monday', t: 'Plan drop', player: 'This week’s reps appear on Today, with the focus and one cue.', coach: 'Adjusts the plan from last week’s check-ins and games.' },
  { d: 'Tue–Thu', t: 'Rep and check in', player: 'Tap each finished set, write one honest sentence, and add a 30-second clip if you like.', coach: 'Replies by the deadline: what went well, one adjustment, why, the next rep.' },
  { d: 'Midweek', t: 'A nudge, only if needed', player: 'No check-in yet? One reminder, not a stream of them.', coach: 'Sees who has gone quiet at the top of the queue.' },
  { d: 'Game day', t: 'Play, then log it', player: 'Read the pre-game card. Afterwards: a one-minute log. Did I try my focus?', coach: 'Reads every log. Answers one game a week in writing when asked.' },
  { d: 'Friday', t: 'Wrap', player: 'Two lines on the week: what clicked, what didn’t.', coach: 'Uses it to set next week’s focus and reps.' },
  { d: 'Sunday', t: 'Parent summary', player: '—', coach: 'Approves a one-minute summary for parents: check-ins, streak, focus, games and confidence.' },
];

export const START = [
  { t: 'Apply', d: 'Six quick questions, one per screen. You see a fit result and a suggested plan straight away.' },
  { t: 'A person replies', d: 'The coach reads every application and replies within 2 business days.' },
  { t: 'Invite and consent', d: 'The parent accepts the invite and gives consent for the player.' },
  { t: 'Onboarding', d: 'Five short screens: goal, how the player learns, their weekly rhythm.' },
  { t: 'First plan', d: 'Within 2 business days. One focus, the first reps, and you’re in the weekly loop.' },
];

export type Row = { f: string; v: Record<Tier, string | boolean> };
export const COMPARE: Row[] = [
  { f: 'Written reply window', v: { Foundation: TIERS.Foundation.replyLabel, Development: TIERS.Development.replyLabel, 'Inner Circle': TIERS['Inner Circle'].replyLabel } },
  { f: 'Written reviews', v: { Foundation: '1 a week', Development: 'Up to 3 a week', 'Inner Circle': 'Every submission' } },
  { f: 'Personal plan, one focus at a time', v: { Foundation: true, Development: true, 'Inner Circle': true } },
  { f: 'Game log, timeline and practice-to-game rate', v: { Foundation: true, Development: true, 'Inner Circle': true } },
  { f: 'Short practice clips (30 s) with a check-in', v: { Foundation: true, Development: true, 'Inner Circle': true } },
  { f: 'Weekly parent summary', v: { Foundation: true, Development: true, 'Inner Circle': true } },
  { f: 'Plan adjusted every 2 weeks', v: { Foundation: false, Development: true, 'Inner Circle': true } },
  { f: 'Skill rubric updated every cycle', v: { Foundation: false, Development: true, 'Inner Circle': true } },
  { f: 'Live video', v: { Foundation: false, Development: '20 min, monthly', 'Inner Circle': '30 min, weekly' } },
  { f: 'Pre-tournament game plan', v: { Foundation: false, Development: false, 'Inner Circle': true } },
  { f: 'Season goal review with parents', v: { Foundation: false, Development: false, 'Inner Circle': true } },
];
export const TIER_TAG: Record<Tier, string> = { Foundation: 'Build the habit', Development: 'Most families', 'Inner Circle': '4 spots in total' };

export const FAQ: [string, string][] = [
  ['Is this in person?', 'No. Players train on their own court or driveway, log the work in the app and get written replies. Development and Inner Circle include live video calls.'],
  ['What ages?', 'Players 10–17 who can practice on their own at least 2 days a week, even for 15 minutes. Under-13s sign in with a username and PIN their parent sets, not an email.'],
  ['What happens if the coach is late?', 'Every check-in has a reply-by time based on your plan. If it passes, the item goes to the top of the coach’s queue marked overdue, and you can see the deadline on Today.'],
  ['Do you review game film?', 'No full-game film. A player can send one short practice clip (up to 30 seconds) with a check-in, and the coach replies in writing with time-stamped notes.'],
  ['How do you track games?', 'Players log each game in about a minute: optional stats, confidence, focus and energy from 1 to 5, one thing that went well, and whether they tried their focus. The coach reads every log.'],
  ['Why only 15 players?', 'The coach reads every check-in personally. Beyond 15, replies slow down and plans stop being personal. The app enforces the cap, and new families join a waitlist.'],
  ['Contracts and cancelling?', 'None. Month to month. Pause coaching anytime and pick up where you left off (pausing doesn’t stop billing). Cancel in Billing, and coaching runs to the end of the month you paid for.'],
  ['Is there an app?', 'Yes. It’s a web app you add to your home screen (iPhone: Share, then Add to Home Screen). It opens full screen, records clips with the camera and can notify you when your coach replies.'],
];

export const NOT = ['Full-game film breakdown', 'AI coaching', 'Recruiting or exposure promises', 'In-person or team practice', 'Grades or rankings for kids'];
