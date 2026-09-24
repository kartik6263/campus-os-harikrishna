import { Router } from 'express';
import { requireAuth, requireRole } from '../../auth/middleware.js';
import { profileRouter } from './profile.js';
import { facultyAttendanceRouter } from './attendance.js';
import { marksRouter } from './marks.js';
import { mentoringRouter } from './mentoring.js';
import { leaveRouter } from './leave.js';
import { materialsRouter } from './materials.js';

/**
 * Phase 2 — everything a lecturer does.
 *
 * The role gate is applied once here rather than in each sub-router, so a new
 * faculty route cannot be added without it. Scoping to the individual lecturer
 * is separate and happens per request in `resolveFacultyId`.
 */
export const facultyRouter = Router();

facultyRouter.use(requireAuth);
facultyRouter.use(requireRole('FACULTY', 'ADMIN'));

facultyRouter.use(profileRouter);
facultyRouter.use(facultyAttendanceRouter);
facultyRouter.use(marksRouter);
facultyRouter.use(mentoringRouter);
facultyRouter.use(leaveRouter);
facultyRouter.use(materialsRouter);
