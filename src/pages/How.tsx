import { Link } from 'react-router-dom';
import { Footer, SiteHeader } from '../App';
import { TRANSITIONS } from '../../shared/workflow';
import type { LifecycleState } from '../../shared/domain';

const LANES: { stage: string; who: 'family' | 'coach' | 'player' | 'system'; states: LifecycleState[]; note: string }[] = [
  { stage: 'Join', who: 'family', states: ['Applied', 'Fit review', 'Invited', 'Onboarding'], note: 'Coach decides fit against live capacity. Full roster or Inner Circle → Waitlist.' },
  { stage: 'Plan', who: 'coach', states: ['Plan building', 'Plan set'], note: 'Coach owes a plan within 2 business days of onboarding. Player reads the focus to unlock rep 1.' },
  { stage: 'Loop', who: 'player', states: ['Work ready', 'Submitted', 'Feedback due', 'Next step ready'], note: 'Submitted → Feedback due after 24 h. Past the tier’s reply-by time it’s overdue and jumps to the top of the queue.' },
  { stage: 'Grow', who: 'coach', states: ['Cycle review'], note: 'Every 4 weeks (or after the last rep): the player says what improved, the coach re-rates the rubric and picks the next focus, then publishes cycle N+1.' },
];
export default function How() {
  return (<>
    <SiteHeader />
    <main id="main" tabIndex={-1} className="paper"><div className="wrap">
      <p className="kicker">Workflow</p><h1 className="display xl dark">How everything connects</h1>
      <p className="lead dark">One engine runs every screen. The family, the player and the coach all see the same state, worded for their role: <b>what’s happening, why it matters, who acts next, by when, and what it unlocks.</b></p>
      <div className="lanes">{LANES.map((l, i) => (
        <section key={l.stage} className={`lane ${l.who}`}>
          <header><span className="num">{i + 1}</span><h2 className="display">{l.stage}</h2></header>
          <ol className="flowline">{l.states.map((st) => <li key={st}>{st}</li>)}</ol>
          <p className="small">{l.note}</p>
        </section>))}
      </div>
      <p className="small muted">Side states: <b>Waitlist</b> (no capacity) · <b>Paused</b> (family pauses; resume returns to the exact prior state). Cycle review loops back to Plan set.</p>

      <h2 className="display">Every transition, with its guard</h2>
      <div className="ttable" role="table" aria-label="State transitions">
        <div role="row" className="th"><span role="columnheader">Action</span><span role="columnheader">From</span><span role="columnheader">To</span><span role="columnheader">Who</span></div>
        {TRANSITIONS.map((t) => <div role="row" key={t.cmd}><span role="cell"><code>{t.cmd}</code><br /><span className="small muted">{t.label}</span></span><span role="cell" className="small">{t.from.join(', ')}</span><span role="cell"><b>{t.to === 'dynamic' ? 'depends' : t.to}</b></span><span role="cell"><span className={`who-tag ${t.actor}`}>{t.actor}</span></span></div>)}
      </div>

      <div className="grid3">
        <div className="card"><h3>Reply-by SLAs</h3><p>Foundation: 2 business days · Development: 1 · Inner Circle: same business day. Weekends don’t count. Messages from families get the same window; parents can mark a message urgent (4 office hours).</p></div>
        <div className="card"><h3>Capacity</h3><p>15 players on the roster, 4 in Inner Circle. The engine refuses invites past the cap and moves the family to Waitlist.</p></div>
        <div className="card"><h3>Coach queue</h3><p>One list: Reply needed → Sign-off → Work ready → Cycle review → Plan needed → Promise → Activation → Upcoming. Overdue items go first. Promise items appear before a promise is at risk.</p></div>
      </div>
      <div className="grid3">
        <div className="card"><h3>Weekly rhythm</h3><p>Mon: plan drop · Wed: mid-week check-in · Fri: wrap and two-line reflection · Sun: parent summary. Notifications and the Today screen follow it.</p></div>
        <div className="card"><h3>Reviews per week</h3><p>Foundation 1 · Development up to 3 · Inner Circle every submission. Extra check-ins are logged and the next rep still unlocks.</p></div>
        <div className="card"><h3>Promise ledger</h3><p>Every promise on this site maps to an engine rule, a family screen and a coach alert. See <code>PROMISES.md</code>.</p></div>
      </div>
      <div className="row gap"><Link className="btn" to="/log">Open the live system log</Link><Link className="btn ghost" to="/coach">See the coach queue</Link></div>
    </div></main>
    <Footer />
  </>);
}
