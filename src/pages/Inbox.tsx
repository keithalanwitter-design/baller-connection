import { useSnap, useStore } from '../store';
import { perspective } from '../store';
import { canSeeList } from '../v4inbox';
import { UnifiedInbox } from '../v4';

/** One inbox for every role: message threads (with context + reply-by) and notifications, with filters. */
export default function Inbox() {
  const s = useSnap(); const { as } = useStore(); const view = perspective(as?.role);
  const players = canSeeList(s, as);
  return (<div className="inbox">
    <h1 className="display">Inbox</h1>
    <p className="dim small">Messages and alerts in one list. {view === 'coach' ? 'Threads waiting on you show their reply-by time and also sit in your Action Center.' : 'Each message shows when to expect a reply.'} Unread alerts are also emailed as a digest.</p>
    <UnifiedInbox players={players} me={as?.role === 'ops' ? 'ops' : view === 'coach' ? 'coach' : as?.role === 'parent' ? 'parent' : 'player'} />
  </div>);
}
