import type { Role } from '@prisma/client';

/**
 * Who may read and write each family of workspace registers.
 *
 * A collection is named `<namespace>:<register>`, e.g. `student:grievance` or
 * `gov:assets`. The namespace alone decides access, so a screen cannot widen
 * its own permissions by choosing a new register name.
 */

const STAFF: Role[] = ['FACULTY', 'OFFICE', 'PRINCIPAL', 'REGISTRAR', 'ADMIN'];
const ADMINISTRATION: Role[] = ['PRINCIPAL', 'REGISTRAR', 'ADMIN'];
const EVERYONE: Role[] = ['STUDENT', 'PARENT', ...STAFF];

export interface CollectionPolicy {
  read: Role[];
  write: Role[];
  /**
   * Rows belong to one student. A student sees and writes only their own, a
   * parent only their ward's; staff see every student's and may act on them.
   */
  studentScoped: boolean;
}

export const NAMESPACES: Record<string, CollectionPolicy> = {
  /**
   * A student's own requests and records: grievances, gate passes, loans.
   * A parent may write too (consent to a leave request), but only on their
   * ward's rows, as the scope rules confine every parent request.
   */
  student: { read: EVERYONE, write: ['STUDENT', 'PARENT', ...STAFF], studentScoped: true },
  /**
   * What a desk keeps about each student: library loans and fines. A student
   * or parent reads their own rows but cannot change them — a loan's due date
   * or fine is the desk's to set, never the borrower's.
   */
  desk: { read: EVERYONE, write: STAFF, studentScoped: true },
  /** What a parent raises about their ward: messages, gate-pass consent. */
  parent: { read: EVERYONE, write: ['PARENT', ...STAFF], studentScoped: true },
  /** Catalogues everyone reads and staff maintain: books, menus, drives, schemes. */
  campus: { read: EVERYONE, write: STAFF, studentScoped: false },
  /** Academic operations: the university's exam, hostel and library desks. */
  acad: { read: STAFF, write: ['OFFICE', ...ADMINISTRATION], studentScoped: false },
  /** Teaching staff's shared registers. */
  faculty: { read: ['FACULTY', ...ADMINISTRATION], write: ['FACULTY', ...ADMINISTRATION], studentScoped: false },
  /** Governance: finance, HR, assets, affiliation, stakeholders. */
  gov: { read: ADMINISTRATION, write: ADMINISTRATION, studentScoped: false },
  /** The IT Cell's own configuration: organisation tree, workflows, roles. */
  it: { read: ['ADMIN', 'REGISTRAR'], write: ['ADMIN', 'REGISTRAR'], studentScoped: false },
};

const NAME = /^([a-z]+):([a-z0-9][a-z0-9._-]{0,63})$/;

export function policyFor(collection: string): CollectionPolicy | null {
  const match = NAME.exec(collection);
  if (!match) return null;
  return NAMESPACES[match[1]!] ?? null;
}

export const isStaff = (role: Role) => STAFF.includes(role);
