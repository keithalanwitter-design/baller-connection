import type { TableName } from '../shared/domain';
/** Column mapping between domain objects (camelCase) and normalized SQL tables. Used by the repository and by scripts/gen-schema.ts. */
export type Kind = 'text' | 'int' | 'real' | 'bool' | 'json';
export interface Col { prop: string; col: string; kind: Kind; notNull?: boolean; ref?: string; onDelete?: 'CASCADE' | 'SET NULL'; unique?: boolean }
const c = (prop: string, kind: Kind = 'text', extra: Partial<Col> = {}): Col => ({ prop, col: extra.col ?? prop.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase()), kind, ...extra });
const pl = (notNull = true) => c('playerId', 'text', { ref: 'players(id)', onDelete: 'CASCADE', notNull });
export const SCHEMA: Record<TableName, { table: string; cols: Col[]; indexes?: string[] }> = {
  families: { table: 'families', cols: [c('id'), c('parentName', 'text', { notNull: true }), c('email'), c('deletedAt')], indexes: ['email'] },
  users: { table: 'users', cols: [c('id'), c('name', 'text', { notNull: true }), c('email', 'text', { unique: true }), c('username', 'text', { unique: true }), c('role', 'text', { notNull: true }), c('familyId', 'text', { ref: 'families(id)', onDelete: 'SET NULL' }), c('playerId', 'text', { ref: 'players(id)', onDelete: 'SET NULL' }), c('active', 'bool', { notNull: true })], indexes: ['role', 'family_id'] },
  players: { table: 'players', cols: [c('id'), c('familyId', 'text', { ref: 'families(id)', onDelete: 'CASCADE', notNull: true }), c('name', 'text', { notNull: true }), c('age', 'int'), c('position'), c('tier', 'text', { notNull: true }), c('state', 'text', { notNull: true }), c('stateSince', 'text', { notNull: true }), c('pausedFrom'), c('goal'), c('learnStyle'), c('rhythm'), c('canvas'), c('rubric', 'json'), c('nextSession'), c('coachId', 'text', { ref: 'users(id)', onDelete: 'SET NULL' }), c('billing', 'text', { notNull: true })], indexes: ['state', 'coach_id', 'family_id'] },
  applications: { table: 'applications', cols: [c('id'), c('at', 'text', { notNull: true }), pl(), c('answers', 'json'), c('tier'), c('fit'), c('next')], indexes: ['player_id'] },
  invites: { table: 'invites', cols: [c('id'), pl(), c('email', 'text', { notNull: true }), c('token', 'text', { unique: true, notNull: true }), c('code', 'text', { notNull: true }), c('sentAt', 'text', { notNull: true }), c('expiresAt', 'text', { notNull: true }), c('createdBy'), c('acceptedAt'), c('acceptedBy'), c('status', 'text', { notNull: true })], indexes: ['player_id', 'code', 'status'] },
  consents: { table: 'consents', cols: [c('id'), pl(), c('guardianName', 'text', { notNull: true }), c('userId'), c('version', 'text', { notNull: true }), c('text', 'text', { notNull: true }), c('at', 'text', { notNull: true })], indexes: ['player_id'] },
  cycles: { table: 'cycles', cols: [c('id'), pl(), c('index', 'int', { col: 'idx' }), c('focus'), c('startAt'), c('endAt'), c('status'), c('templateId')], indexes: ['player_id'] },
  drills: { table: 'drills', cols: [c('id'), c('title', 'text', { notNull: true }), c('reps', 'int'), c('minutes', 'int'), c('cues', 'json'), c('tags', 'json'), c('createdBy'), c('archived', 'bool')] },
  templates: { table: 'templates', cols: [c('id'), c('name', 'text', { notNull: true }), c('focus'), c('drillIds', 'json'), c('createdBy')] },
  assignments: { table: 'assignments', cols: [c('id'), c('cycleId', 'text', { ref: 'cycles(id)', onDelete: 'CASCADE' }), pl(), c('drillId'), c('order', 'real', { col: 'ord' }), c('title'), c('reps', 'int'), c('minutes', 'int'), c('cues', 'json'), c('status', 'text', { notNull: true })], indexes: ['player_id', 'cycle_id'] },
  submissions: { table: 'submissions', cols: [c('id'), c('assignmentId', 'text', { ref: 'assignments(id)', onDelete: 'CASCADE' }), pl(), c('repsDone', 'int'), c('reflection'), c('linkUrl'), c('at', 'text', { notNull: true }), c('dueBy', 'text', { notNull: true })], indexes: ['player_id', 'due_by'] },
  reviews: { table: 'reviews', cols: [c('id'), c('submissionId', 'text', { ref: 'submissions(id)', onDelete: 'CASCADE' }), pl(), c('decision'), c('feedback'), c('at'), c('reviewerId'), c('status'), c('signedOffBy'), c('signedOffAt')], indexes: ['player_id', 'status'] },
  messages: { table: 'messages', cols: [c('id'), pl(), c('from', 'text', { col: 'sender' }), c('authorId'), c('text'), c('linkUrl'), c('at'), c('dueBy'), c('answered', 'bool'), c('readBy', 'json')], indexes: ['player_id', 'answered'] },
  habits: { table: 'habits', cols: [c('id'), pl(), c('date'), c('key', 'text', { col: 'habit' })], indexes: ['player_id, date'] },
  milestones: { table: 'milestones', cols: [c('id'), pl(), c('key', 'text', { col: 'milestone' }), c('at')], indexes: ['player_id'] },
  digests: { table: 'digests', cols: [c('id'), pl(), c('week'), c('text'), c('status'), c('approvedAt'), c('approvedBy')], indexes: ['player_id, week'] },
  meetings: { table: 'meetings', cols: [c('id'), c('playerId', 'text', { ref: 'players(id)', onDelete: 'CASCADE' }), c('staffId'), c('at'), c('minutes', 'int'), c('kind'), c('note'), c('status')], indexes: ['at', 'staff_id'] },
  notifications: { table: 'notifications', cols: [c('id'), c('userId', 'text', { ref: 'users(id)', onDelete: 'CASCADE', notNull: true }), c('type'), c('text'), c('playerId'), c('link'), c('at'), c('readAt'), c('emailedAt'), c('dedupe', 'text', { unique: true })], indexes: ['user_id, read_at'] },
  outbox: { table: 'outbox', cols: [c('id'), c('to', 'text', { col: 'recipient' }), c('subject'), c('body'), c('at'), c('status'), c('kind')], indexes: ['status'] },
  dataRequests: { table: 'data_requests', cols: [c('id'), c('playerId'), c('familyId'), c('kind'), c('requestedBy'), c('at'), c('status'), c('doneAt')], indexes: ['status'] },
  events: { table: 'events', cols: [c('id'), c('at', 'text', { notNull: true }), c('role'), c('actorId'), c('playerId'), c('type'), c('from', 'text', { col: 'from_state' }), c('to', 'text', { col: 'to_state' }), c('detail')], indexes: ['at', 'player_id'] },
};
/** Insert order (parents before children); deletes run in reverse. FKs are DEFERRABLE so a batch is checked at commit. */
export const ORDER: TableName[] = ['families', 'users', 'players', 'applications', 'invites', 'consents', 'cycles', 'drills', 'templates', 'assignments', 'submissions', 'reviews', 'messages', 'habits', 'milestones', 'digests', 'meetings', 'notifications', 'outbox', 'dataRequests', 'events'];
export function createSql() {
  const out: string[] = [];
  for (const t of ORDER) {
    const { table, cols, indexes = [] } = SCHEMA[t];
    const defs = cols.map((x) => `  ${x.col} ${{ text: 'TEXT', int: 'INTEGER', real: 'REAL', bool: 'INTEGER', json: 'TEXT' }[x.kind]}${x.prop === 'id' ? ' PRIMARY KEY' : ''}${x.notNull ? ' NOT NULL' : ''}${x.unique ? ' UNIQUE' : ''}${x.ref ? ` REFERENCES ${x.ref} ON DELETE ${x.onDelete ?? 'CASCADE'} DEFERRABLE INITIALLY DEFERRED` : ''}`);
    out.push(`CREATE TABLE IF NOT EXISTS ${table} (\n${defs.join(',\n')}\n);`);
    for (const ix of indexes) out.push(`CREATE INDEX IF NOT EXISTS idx_${table}_${ix.replace(/[, ]+/g, '_')} ON ${table}(${ix});`);
  }
  return out.join('\n');
}
