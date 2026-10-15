import { TIERS, type Tier } from '../../shared/domain';

/** All marketing copy in one place. Every claim maps to a promise id in PROMISES.md (see POSITIONING.md). Tone: VOICE.md. */
export const PROMISE = 'A coach who sees your reps between sessions.';
export const OUTCOME = 'Make practice show up in games.';
export const SUB = 'Send one short clip. Your coach writes back one specific adjustment. You say it back in your own words, and your next clip shows the change. Built for players about 11–15, and the parents behind them.';

export const PILLARS = [
  { k: 'plan', n: '01', t: 'A coach who looks first', d: 'Within 2 business days of setup, your coach looks at a clip or his own session notes and tells you what he saw in you and what to work on first. One focus at a time.', proof: 'First look within 2 business days of setup.' },
  { k: 'coach', n: '02', t: 'One clip, one adjustment', d: 'Send a clip of 30 seconds or less. A named person writes back: what went well, one adjustment, why it matters, and your next rep. Never an AI.', proof: 'Every reply has a deadline you can see.' },
  { k: 'proof', n: '03', t: 'Say it back, then see it change', d: 'You say the adjustment in your own words and your coach tells you “got it” or clears it up. Every 4 weeks he puts week 1 next to now and tells you what changed.', proof: 'A re-check every 4 weeks.' },
];

export const WEEK = [
  { d: 'Monday', t: 'New week', player: 'Your focus for the week is on Today, with the next rep.', coach: 'Looks at who is due a first look or a re-check.' },
  { d: 'Your clip day', t: 'One rep, one clip', player: 'Do the rep. Send a clip of 30 seconds or less and one honest sentence about what happened.', coach: 'Watches it and writes back by the reply window: what went well, one adjustment, why, the next rep.' },
  { d: 'After the reply', t: 'Say it back', player: 'In your own words: what will you do differently, and what will you notice? Optional. The next rep never waits on it.', coach: 'Reads it and marks it “got it,” or opens a short thread to clear it up.' },
  { d: 'Game day', t: 'Play, then one note', player: 'Afterwards: what carried over, and what didn’t. A sentence each.', coach: 'Reads every note and marks it carried over, partly, or not yet.' },
  { d: 'Friday', t: 'Rough week? Say so', player: 'If the week got away from you: a light week, a reset, or a note to your coach. No lecture.', coach: 'Checks in with anyone who went quiet.' },
  { d: 'Sunday', t: 'Parent note', player: '—', coach: 'Approves a short note for parents: what was sent, what it means this week, and what to do and skip.' },
];

export const START = [
  { t: 'Apply', d: 'A few quick questions, one per screen, including one for the player to answer in their own words. You see a fit result straight away.' },
  { t: 'A person replies', d: 'The coach reads every application and replies within 2 business days.' },
  { t: 'Invite and consent', d: 'The parent accepts the invite and gives consent for the player.' },
  { t: 'Setup', d: 'Meet your coach, pick a realistic rhythm, and agree on who does what: player, parent, coach.' },
  { t: 'First look', d: 'Within 2 business days your coach tells you what he saw and sets your first focus.' },
];

export type Row = { f: string; v: Record<Tier, string | boolean> };
export const COMPARE: Row[] = [
  { f: 'Your coach writes back', v: { Foundation: TIERS.Foundation.replyLabel, Development: TIERS.Development.replyLabel, 'Inner Circle': TIERS['Inner Circle'].replyLabel } },
  { f: 'Written reviews', v: { Foundation: '1 a week', Development: 'Up to 3 a week', 'Inner Circle': 'Every clip' } },
  { f: 'First look and one focus at a time', v: { Foundation: true, Development: true, 'Inner Circle': true } },
  { f: 'Say-it-back, read by your coach', v: { Foundation: true, Development: true, 'Inner Circle': true } },
  { f: 'Re-check every 4 weeks', v: { Foundation: true, Development: true, 'Inner Circle': true } },
  { f: 'Short practice clips (30 s)', v: { Foundation: true, Development: true, 'Inner Circle': true } },
  { f: 'Private “I’m stuck” note to your coach', v: { Foundation: true, Development: true, 'Inner Circle': true } },
  { f: 'Weekly parent note', v: { Foundation: true, Development: true, 'Inner Circle': true } },
  { f: 'Live video', v: { Foundation: false, Development: '20 min, monthly', 'Inner Circle': '30 min, weekly' } },
];
export const TIER_TAG: Record<Tier, string> = { Foundation: 'Build the habit', Development: 'Most families', 'Inner Circle': '4 spots in total' };

/** Honest fit. Shown on Plans and at the end of Apply. */
export const FIT = {
  good: ['A player who wants to get better and will send a short clip most weeks.', 'Families who want one clear next step, not a stack of drills.', 'Players who already train with a coach and want that work to keep going between sessions.'],
  not: ['You want full-game film breakdown. We don’t do that.', 'You want in-person or team practice. This is remote coaching between sessions.', 'It’s mostly the parent’s idea and the player doesn’t want it. That one doesn’t work.', 'You want an app that keeps your player busy. This asks for one clip and one honest sentence.'],
};

export const FAQ: [string, string][] = [
  ['Is this in person?', 'No. Players train on their own court or driveway and send short clips. Your coach writes back. Development and Inner Circle include live video calls. If you already train in person, this picks up between sessions.'],
  ['What ages?', 'Built for players about 11–15. Players 10–17 can apply if they can practice on their own at least 2 days a week, even for 15 minutes. Under-13s sign in with a username and PIN their parent sets.'],
  ['What does my player actually do each week?', 'Pick a clip day. Do the rep, send a clip of 30 seconds or less with one honest sentence, read the reply, and say the adjustment back in their own words. That’s it.'],
  ['What happens if the coach is late?', 'Every clip has a reply-by time based on your plan, and you can see it on Today. If it passes, it goes to the top of the coach’s queue marked overdue.'],
  ['Do you review game film?', 'No. A player sends one short practice clip (up to 30 seconds), and the coach replies in writing with time-stamped notes.'],
  ['What if my player has a bad week, or gets frustrated?', 'There’s an “I’m stuck” button on every player screen. It sends a private note to the coach, who writes back himself within your reply window. A missed week is fine: a light week, a reset, or a talk with the coach.'],
  ['What do I see as a parent?', 'One short note each Sunday, plus a timeline. No alert for every clip unless you turn that on. A player’s “I’m stuck” notes stay between the player and the coach; he may talk with you if something needs a grown-up.'],
  ['Why only 15 players?', 'The coach reads every clip personally. Beyond 15, replies slow down. The app enforces the cap, and new families join a waitlist.'],
  ['Contracts and cancelling?', 'None. Month to month. Pause coaching anytime and pick up where you left off (pausing doesn’t stop billing). Cancel in Billing, and coaching runs to the end of the month you paid for.'],
  ['Is there an app?', 'It’s a web app you add to your home screen (iPhone: Share, then Add to Home Screen). It opens full screen and records clips with the camera.'],
];

export const NOT = ['Full-game film breakdown', 'AI coaching', 'Recruiting or exposure promises', 'In-person or team practice', 'Grades or rankings for kids'];
