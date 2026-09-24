import { Router } from 'express';
import { requireAuth, requireRole } from '../../auth/middleware.js';
import { requirePermission } from '../itconsole/permissions.js';
import { sessionsRouter } from './sessions.js';
import { centresRouter } from './centres.js';
import { evaluationRouter } from './evaluation.js';
import { resultsRouter } from './results.js';

/**
 * Phase 4 — the university examination back-office.
 *
 * Gated to the examination wing. Everything a student can see of this — their
 * result, their revaluation — comes through the student routes instead, and
 * only once the session has been published.
 */
export const examRouter = Router();

examRouter.use(requireAuth);
examRouter.use(requireRole('REGISTRAR', 'ADMIN'));
// Phase 9: the console can withhold this module from a role outright.
examRouter.use(requirePermission('Examinations'));

examRouter.use(sessionsRouter);
examRouter.use(centresRouter);
examRouter.use(evaluationRouter);
examRouter.use(resultsRouter);
