import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { env, originAllowed } from './env.js';
import { errorHandler, notFoundHandler } from './lib/http.js';
import { requireAuth } from './auth/middleware.js';
import { authRouter } from './auth/routes.js';
import { studentRouter } from './modules/student.js';
import { feesRouter, paymentsWebhookRouter } from './modules/fees.js';
import { attendanceRouter } from './modules/attendance.js';
import { announcementsRouter } from './modules/announcements.js';
import { facultyRouter } from './modules/faculty/index.js';
import { officeRouter } from './modules/office/index.js';
import { studentCertificatesRouter } from './modules/office/certificates.js';
import { examRouter } from './modules/exam/index.js';
import { governanceRouter } from './modules/governance/index.js';
import { accreditationRouter } from './modules/accreditation/index.js';
import { procurementRouter } from './modules/procurement/index.js';
import { rtiRouter } from './modules/rti/index.js';
import { itRouter } from './modules/itconsole/index.js';
import { intelligenceRouter } from './modules/intelligence/index.js';
import { studentRevaluationRouter } from './modules/exam/results.js';
import { studentExamRouter } from './modules/exam/student.js';
import { institutionRouter } from './modules/institution.js';
import { recordsRouter } from './modules/records/index.js';
import { filesRouter } from './modules/files.js';
import { insightsRouter } from './modules/insights.js';
import { assistantRouter } from './modules/assistant/index.js';
import { learningRouter } from './modules/learning.js';
import { verifyRouter } from './modules/verify.js';
import { vendorRouter } from './modules/vendor.js';
import { verificationRouter } from './modules/verification.js';
import { allocationRouter } from './modules/allocation.js';
import { poolRouter, tenantScope } from './tenancy.js';
import { metricsMiddleware } from './lib/metrics.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  // Behind Render's proxy, so req.ip is the caller rather than the proxy.
  if (env.isProd) app.set('trust proxy', 1);
  app.use(helmet());
  app.use(compression());
  // Attachments arrive as raw bytes and are read by their own route.
  // The raw bytes are kept too: a payment webhook is signed over them exactly.
  const json = express.json({
    limit: '1mb',
    verify: (req, _res, buf) => { (req as express.Request & { rawBody?: Buffer }).rawBody = buf; },
  });
  app.use((req, res, next) => (req.path.startsWith('/api/files') ? next() : json(req, res, next)));
  app.use(cookieParser());
  app.use(metricsMiddleware);

  app.use(
    cors({
      // Allow tools with no Origin (curl, the Expo native runtime) through,
      // but keep browsers restricted to the configured list.
      origin(origin, cb) {
        if (!origin || originAllowed(env.corsOrigins, origin)) return cb(null, true);
        // No CORS headers, so the browser blocks it; not a 500 in the logs.
        cb(null, false);
      },
      credentials: true,
    }),
  );

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'campus-os-api',
      env: env.NODE_ENV,
      ...(env.POOL_MODE ? { pool: env.POOL_ID } : {}),
      time: new Date(),
    });
  });

  // Phase 2: on a shared pool, the control plane adds and removes institutes
  // here, and every other request runs inside its institute's schema.
  app.use('/internal/pool', poolRouter);
  app.use(tenantScope);

  app.use('/api/auth', authRouter);
  app.use('/api/institution', institutionRouter);
  // Signed by the gateway rather than a user, so it sits outside requireAuth.
  app.use('/api/payments', paymentsWebhookRouter);
  app.use('/api/student/fees', feesRouter);
  app.use('/api/student', studentRouter);
  app.use('/api/attendance', attendanceRouter);
  app.use('/api/announcements', announcementsRouter);
  app.use('/api/faculty', facultyRouter);
  app.use('/api/office', officeRouter);
  app.use('/api/exam', examRouter);
  app.use('/api/governance', governanceRouter);
  app.use('/api/accreditation', accreditationRouter);
  app.use('/api/procurement', procurementRouter);
  app.use('/api/rti', rtiRouter);
  app.use('/api/it', itRouter);
  app.use('/api/intelligence', intelligenceRouter);
  app.use('/api/records', recordsRouter);
  app.use('/api/files', filesRouter);
  app.use('/api/insights', insightsRouter);
  app.use('/api/assistant', assistantRouter);
  app.use('/api/learning', learningRouter);
  app.use('/api/verify', verifyRouter);
  app.use('/api/vendor', vendorRouter);
  app.use('/api/verification', verificationRouter);
  app.use('/api/allocation', allocationRouter);
  // The students' own halves of the office and examination counters.
  app.use('/api/student/certificates', studentCertificatesRouter);
  app.use('/api/student/revaluations', requireAuth, studentRevaluationRouter);
  app.use('/api/student/exam', requireAuth, studentExamRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
