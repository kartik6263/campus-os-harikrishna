/**
 * The IT Cell is part of the administration department: the Admin Console's
 * sidebar opens it at a particular page. Screens carry no parameters, so the
 * page to open is left here for the IT Cell to pick up as it mounts.
 */
export type ITCellGroup = 'institution' | 'org' | 'users' | 'roles' | 'workflows' | 'audit';

/** Admin Console sidebar entries under "IT Cell", and where each one lands. */
export const IT_CELL_ENTRIES: Record<string, { group: ITCellGroup; sub: string }> = {
  'Institution Profile': { group: 'institution', sub: 'profile' },
  'Users & Accounts': { group: 'users', sub: 'directory' },
  'Roles & Permissions': { group: 'roles', sub: 'matrix' },
  'Audit Log': { group: 'audit', sub: 'log' },
};

let pending: { group: ITCellGroup; sub: string } | null = null;

/** Records which IT Cell page the next visit should open on. */
export function openITCellAt(entry: string) {
  pending = IT_CELL_ENTRIES[entry] ?? null;
}

/** The page to open on, once; later visits start at the default. */
export function takeITCellEntry(): { group: ITCellGroup; sub: string } {
  const p = pending ?? { group: 'institution' as const, sub: 'profile' };
  pending = null;
  return p;
}
