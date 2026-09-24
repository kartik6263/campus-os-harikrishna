import type { NextFunction, Request, Response } from 'express';
import type { Role } from '@prisma/client';
import { prisma } from '../../db.js';
import { ApiError } from '../../lib/http.js';
import { recordFor } from './audit.js';

/**
 * The permission matrix, and the guard that consults it.
 *
 * A missing rule means allow. That way the matrix is somewhere to *withhold*
 * a module from a role rather than a list that has to be complete before
 * anything works at all — and adding a module to the system cannot
 * accidentally lock everyone out of it.
 */

/** The modules the matrix can speak about. */
export const MODULES = [
  'Admissions',
  'Examinations',
  'Fee Management',
  'Certificates',
  'Faculty',
  'Governance',
  'Accreditation',
  'Procurement',
  'RTI',
  'System Config',
  'Audit Log',
] as const;

export const ACTIONS = ['view', 'create', 'edit', 'delete', 'approve', 'publish', 'export'] as const;

export type ModuleName = (typeof MODULES)[number];
export type ActionName = (typeof ACTIONS)[number];

/**
 * Whether a role may take an action in a module.
 *
 * Read on every guarded request, so revoking a module in the console takes
 * effect on the next call rather than at the next restart.
 */
export async function isAllowed(role: Role, module: string, action: string): Promise<boolean> {
  const rule = await prisma.permissionRule.findUnique({
    where: { role_module_action: { role, module, action } },
    select: { effect: true },
  });
  // No rule is not a refusal.
  return rule?.effect !== 'DENY';
}

/**
 * Refuses the request when the matrix withholds this module from the caller's
 * role. A refusal is recorded, because an attempt on something withheld is
 * exactly what an audit log is for.
 */
export function requirePermission(module: ModuleName, action: ActionName = 'view') {
  return (req: Request, _res: Response, next: NextFunction) => {
    const auth = req.auth;
    if (!auth) {
      next(ApiError.unauthorized());
      return;
    }

    void isAllowed(auth.role, module, action)
      .then(async (allowed) => {
        if (allowed) {
          next();
          return;
        }
        await recordFor(req, {
          module,
          action,
          target: `${req.method} ${req.path}`,
          detail: `Refused: the matrix withholds ${action} on ${module} from ${auth.role}`,
          outcome: 'DENIED',
        });
        next(
          new ApiError(
            403,
            `Your role may not ${action} in ${module}`,
            'forbidden',
            { module, action, role: auth.role },
          ),
        );
      })
      .catch(next);
  };
}
