import { Router } from 'express';
import { requireAuth, requireRole } from '../../auth/middleware.js';
import { admissionsRouter } from './admissions.js';
import { counterRouter } from './counter.js';
import { certificatesRouter } from './certificates.js';
import { examFormsRouter } from './examforms.js';

/**
 * Phase 3 — the college office counter.
 *
 * The role gate is applied once here, as with the faculty router, so a new
 * office route cannot be added without it. Which clerk is acting is resolved
 * per request in `resolveStaffId`, because everything here is signed.
 */
export const officeRouter = Router();

officeRouter.use(requireAuth);
officeRouter.use(requireRole('OFFICE', 'REGISTRAR', 'ADMIN'));

officeRouter.use(admissionsRouter);
officeRouter.use(counterRouter);
officeRouter.use(certificatesRouter);
officeRouter.use(examFormsRouter);
