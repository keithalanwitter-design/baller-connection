# Baller Connection

**One focus. One next rep. A coach who answers.**

A fresh, standalone take on virtual player development, built as Keith Witter's branded alternative to Baller Path. It's an interactive demo: every screen works end to end in the browser using **fictional players and local storage**. No backend, and nothing is ever sent.

**Live demo:** https://keithalanwitter-design.github.io/baller-connection/

Use the dark demo bar at the top to switch between **Visitor**, **Family** and **Coach**. **Reset demo** restores the starting data. Actions on one side show up on the other right away.

## Concept
- **10-second test.** The hero says what it is (virtual player development), who runs it (one coach, a 15-player cap) and what to do next (Apply in 2 minutes).
- **One next action.** The player's Today screen always shows exactly one "Your next rep" card.
- **One ranked coach queue.** The Action Center lists items in this order: Reply needed, Work ready, Plan needed, Activation, Upcoming. The filter counts come from the same list that draws the rows, so they always match.
- **Same status words on both sides:** Invited, Connected, Active, Plan set, Work ready, Submitted, Feedback due, Next step ready.
- **Honest premium.** No made-up proof stats. Real limits. The coach bio is a clearly labeled placeholder. Film breakdown is described as not offered.

**Brand:** deep forest (#143A30), brass (#D4A548) and court cream (#F7F3EA). Headings are set in Fraunces and body text in Inter. One design system covers the public, player, parent and coach screens.

## Pricing (monthly, no contracts, 15 players max)
| Plan | Price | Includes | Reply window |
|---|---|---|---|
| Foundation | $69 | Personal plan with one focus, a weekly rep set, 1 written review per week, habit tracker, weekly parent summary | 2 business days |
| Development (most families) | $139 | Everything in Foundation, plus up to 3 reviews per week, a plan adjusted every 2 weeks, one 20-minute video check-in per month, and a monthly rubric update | 1 business day |
| Inner Circle (4 spots) | $229 | Everything in Development, plus a weekly 30-minute live session, a review on every submission, a pre-tournament plan, and a season goal review | Same business day |

**Why these prices:** the cap of 15 players is what keeps replies personal. The tiers are priced by how much coach time each one uses: written reviews per week, then live calls. Inner Circle is limited to 4 spots so live sessions fit into one coach's week.

## Workflows
**Family:** Apply (6 questions, one per screen) → fit result and suggested plan → submit or request a call → invite → onboarding (accept, profile, goal, learning style, weekly rhythm) → coach welcome → Today → Log practice (tap the sets done, write one sentence) → Submitted, with "Coach replies by Tue" → Next step ready → Start next rep.

**Coach:** Action Center → Review (approve with feedback and pick the next rep, or ask for another attempt) → Plan builder (one focus plus assigned reps) → Player profile (overview, coach-only player canvas, messages, proof-chain journal, editable rubric) → Weekly digest (edit and approve; parents see it in Parent view).

## Screens
`/` home · `/apply` · `/welcome` · `/app` Today · `/app/development` · `/app/messages` · `/app/progress` · `/parent` · `/coach` Action Center · `/coach/review/:id` · `/coach/plan/:id` · `/coach/player/:id` · `/coach/roster` · `/coach/digest` · `/privacy` · `/terms` · `/support`. The app uses hash routing, so links look like `#/coach`.

## Run
```
npm install
npm run dev        # local dev
npm run build      # type-check + production build
npx vite preview & BASE=http://localhost:4173/baller-connection/ npm test   # Playwright end-to-end check + screenshots in shots/
```

## What's demo vs. what needs a real backend
**Works in the demo, saved in local storage:** applications, onboarding, check-ins, habits and streaks, badges, review approve/retry, the plan builder, messages, the player canvas, the rubric and digest approval.

**Needs a real backend:** accounts and auth (parent and player logins), real invite emails, Stripe billing and roster-cap enforcement, sending messages, email and push notifications for reply deadlines, digest email delivery, a coach-managed assignment library, file and clip uploads, an audit log, and parental-consent records (COPPA for players under 13).
