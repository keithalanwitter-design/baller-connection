import type { Snapshot } from '../shared/domain';
const q = (v: unknown) => `"${String(v ?? '').replaceAll('"', '""')}"`;
/** One CSV with a section per entity for a single player (data-export requests). */
export function playerCsv(s: Snapshot, pid: string) {
  const p = s.players.find((x) => x.id === pid)!; const rows: string[] = ['section,date,field1,field2,field3,field4'];
  rows.push(['player', p.stateSince, p.name, p.tier, p.state, p.goal].map(q).join(','));
  for (const c of s.consents.filter((x) => x.playerId === pid)) rows.push(['consent', c.at, c.guardianName, c.version, '', ''].map(q).join(','));
  for (const c of s.cycles.filter((x) => x.playerId === pid)) rows.push(['cycle', c.startAt, c.index, c.focus, c.status, ''].map(q).join(','));
  for (const sub of s.submissions.filter((x) => x.playerId === pid)) { const a = s.assignments.find((x) => x.id === sub.assignmentId); rows.push(['submission', sub.at, a?.title, sub.repsDone, sub.reflection, sub.linkUrl].map(q).join(',')); }
  for (const r of s.reviews.filter((x) => x.playerId === pid && x.status === 'final')) rows.push(['review', r.at, r.decision, r.feedback, '', ''].map(q).join(','));
  for (const m of s.messages.filter((x) => x.playerId === pid)) rows.push(['message', m.at, m.from, m.text, m.linkUrl, ''].map(q).join(','));
  for (const h of s.habits.filter((x) => x.playerId === pid)) rows.push(['habit', h.date, h.key, '', '', ''].map(q).join(','));
  for (const d of s.digests.filter((x) => x.playerId === pid && x.status === 'approved')) rows.push(['digest', d.week, d.text, '', '', ''].map(q).join(','));
  for (const g of (s.games ?? []).filter((x) => x.playerId === pid)) rows.push(['game', g.date, g.opponent ?? '', JSON.stringify(g.stats ?? {}), `confidence ${g.confidence} focus ${g.focus} energy ${g.energy} tried ${g.focusTried ?? ''}`, `${g.wellDone} | ${g.replay}${g.reply ? ` | coach: ${g.reply.feedback}` : ''}`].map(q).join(','));
  for (const w of (s.wins ?? []).filter((x) => x.playerId === pid)) rows.push(['win', w.at, w.kind, w.text, '', ''].map(q).join(','));
  for (const n of (s.timelineNotes ?? []).filter((x) => x.playerId === pid && x.status === 'approved' && x.kind !== 'cue')) rows.push(['coach-note', n.date, n.kind, n.text, '', ''].map(q).join(','));
  return rows.join('\r\n');
}
const ics = (d: string) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
export function calendarIcs(s: Snapshot) {
  const ev = s.meetings.filter((m) => m.status === 'scheduled').map((m) => { const p = s.players.find((x) => x.id === m.playerId); return ['BEGIN:VEVENT', `UID:${m.id}@ballerconnection`, `DTSTAMP:${ics(new Date().toISOString())}`, `DTSTART:${ics(m.at)}`, `DTEND:${ics(new Date(new Date(m.at).getTime() + m.minutes * 6e4).toISOString())}`, `SUMMARY:${m.kind === 'live' ? 'Live session' : m.kind === 'fit-call' ? 'Fit call' : 'Check-in'}${p ? ` · ${p.name}` : ''}`, `DESCRIPTION:${m.note.replace(/\n/g, ' ')}`, 'END:VEVENT'].join('\r\n'); });
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Baller Connection//EN', ...ev, 'END:VCALENDAR'].join('\r\n');
}
