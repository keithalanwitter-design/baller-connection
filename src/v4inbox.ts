import type { Me } from '../shared/api';
import type { Snapshot } from '../shared/domain';
import { canSeePlayer } from '../shared/permissions';
export const canSeeList = (s: Snapshot, as: Me | null) => (as ? s.players.filter((p) => canSeePlayer({ id: as.id, role: as.role, familyId: (as as { familyId?: string | null }).familyId ?? s.users.find((u) => u.id === as.id)?.familyId, playerId: (as as { playerId?: string | null }).playerId ?? s.users.find((u) => u.id === as.id)?.playerId }, p) && !['Applied', 'Fit review', 'Waitlist'].includes(p.state)) : []);
