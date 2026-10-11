import { Link } from 'react-router-dom';
import { useSnap, useStore } from '../store';
import { relative } from '../../shared/time';
import { clock } from '../../shared/workflow';

const ICON: Record<string, string> = { reply_due_soon: '⏳', overdue: '🚨', new_submission: '📥', feedback_ready: '✅', invite_accepted: '🤝', plan_published: '🗺️', cycle_review: '🔁', signoff_needed: '✍️', new_application: '📝', invite_expired: '⌛', new_message: '✉️', digest_ready: '📰' };
/** Per-user notification inbox (same records feed the email digest). */
export default function Inbox() {
  const s = useSnap(); const { as, run } = useStore(); const t = clock(s);
  const list = s.notifications.filter((n) => n.userId === as?.id).sort((a, b) => b.at.localeCompare(a.at)); const unread = list.filter((n) => !n.readAt);
  const fam = as?.role === 'parent' || as?.role === 'player';
  const fix = (link: string) => (fam && link.startsWith('/app') && as?.role === 'parent' ? link.replace('/app', '/parent') : link);
  return (<div className="inbox">
    <div className="row between wrapx"><h1 className="display">Inbox</h1>{unread.length > 0 && <button className="chip" onClick={() => run({ type: 'markNotificationsRead' })}>Mark all read ({unread.length})</button>}</div>
    <p className="dim small">Reply due soon, overdue, new submissions, feedback, invites, plans and cycle reviews. Anything unread is also emailed as a digest by the scheduler.</p>
    <ol className="nlist">{list.map((n) => <li key={n.id} className={`nitem ${n.readAt ? '' : 'unread'} t-${n.type}`}><span className="nicon" aria-hidden>{ICON[n.type] ?? '•'}</span>
      <Link className="grow" to={fix(n.link)} onClick={() => !n.readAt && run({ type: 'markNotificationsRead', ids: [n.id] })}><span className="block">{n.text}</span><span className="small dim">{relative(n.at, t)}{n.emailedAt ? ' · emailed' : ''}</span></Link></li>)}
      {list.length === 0 && <li className="dim">You’re all caught up.</li>}</ol>
  </div>);
}
