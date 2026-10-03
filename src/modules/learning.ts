import { Router } from 'express';
import { prisma } from '../db.js';
import { asyncHandler } from '../lib/http.js';
import { requireAuth, resolveStudentId } from '../auth/middleware.js';
import { project } from './intelligence/scoring.js';

/**
 * Phase 11 — personalised learning.
 *
 * For one student: which subjects need work, judged by approved internal
 * marks where there are any and by attendance in that subject otherwise, and
 * what to study for each — the material their own teachers uploaded, the
 * institution's curated catalogue (the `campus:learning-resources` register),
 * and the national open courseware (SWAYAM, NPTEL) for the subject.
 *
 * A student reads their own plan, a parent their ward's, staff anyone's.
 */
export const learningRouter = Router();

learningRouter.use(requireAuth);

interface SubjectNeed {
  code: string;
  name: string;
  /** What the judgement rests on. */
  basis: 'internal marks' | 'attendance';
  percent: number;
  level: 'needs attention' | 'watch' | 'on track';
}

const levelOf = (basis: SubjectNeed['basis'], p: number): SubjectNeed['level'] =>
  basis === 'internal marks' ? (p < 45 ? 'needs attention' : p < 60 ? 'watch' : 'on track') : p < 65 ? 'needs attention' : p < 75 ? 'watch' : 'on track';

learningRouter.get(
  ['/', '/:studentId'],
  asyncHandler(async (req, res) => {
    const studentId = await resolveStudentId(req);
    const student = await prisma.student.findUniqueOrThrow({
      where: { id: studentId },
      select: { name: true, enrolmentNo: true, semester: true, programme: { select: { shortName: true } } },
    });

    const [projection, enrolments, attendance] = await Promise.all([
      project([studentId]).then((m) => m.get(studentId) ?? null),
      prisma.enrolment.findMany({ where: { studentId }, select: { subject: { select: { id: true, code: true, name: true } } } }),
      prisma.$queryRaw<Array<{ subjectId: string; held: bigint; present: bigint }>>`
        SELECT cs."subjectId", COUNT(*)::bigint AS held,
          COUNT(ar.id) FILTER (WHERE ar.status IN ('PRESENT','LATE'))::bigint AS present
        FROM class_sessions cs
        JOIN enrolments e ON e."subjectId" = cs."subjectId" AND e."studentId" = ${studentId}
        LEFT JOIN attendance_records ar ON ar."sessionId" = cs.id AND ar."studentId" = ${studentId}
        WHERE cs.date <= now()
        GROUP BY cs."subjectId"`,
    ]);

    const attBySubject = new Map(attendance.map((a) => [a.subjectId, Number(a.held) ? Math.round((Number(a.present) / Number(a.held)) * 1000) / 10 : null]));
    const marksByCode = new Map((projection?.subjects ?? []).map((s) => [s.code, s.percent]));

    const needs: Array<SubjectNeed & { id: string }> = enrolments.flatMap(({ subject }): Array<SubjectNeed & { id: string }> => {
      const marks = marksByCode.get(subject.code);
      const att = attBySubject.get(subject.id) ?? null;
      if (marks !== undefined) return [{ id: subject.id, code: subject.code, name: subject.name, basis: 'internal marks' as const, percent: marks, level: levelOf('internal marks', marks) }];
      if (att !== null) return [{ id: subject.id, code: subject.code, name: subject.name, basis: 'attendance' as const, percent: att, level: levelOf('attendance', att) }];
      return [];
    });
    needs.sort((a, b) => a.percent - b.percent);

    const focus = needs.filter((n) => n.level !== 'on track');
    const targets = focus.length ? focus : needs.slice(0, 2);

    const [materials, catalogue] = await Promise.all([
      prisma.studyMaterial.findMany({
        where: { subjectId: { in: targets.map((t) => t.id) }, visibleToStudents: true },
        select: { id: true, subjectId: true, unit: true, unitTitle: true, filename: true, url: true, type: true, sizeLabel: true, uploadedAt: true, faculty: { select: { name: true } } },
        orderBy: [{ unit: 'asc' }],
      }),
      prisma.workspaceRecord.findMany({ where: { collection: 'campus:learning-resources' }, select: { id: true, data: true } }),
    ]);

    const plan = targets.map((t) => {
      const fromTeachers = materials.filter((m) => m.subjectId === t.id).map((m) => ({
        id: `mat:${m.id}`, kind: 'Teacher material', title: `Unit ${m.unit}: ${m.unitTitle} — ${m.filename}`, source: m.faculty.name, type: m.type.toLowerCase(), url: m.url, size: m.sizeLabel,
      }));
      const curated = catalogue
        .map((r): Record<string, unknown> & { rid: string } => ({ rid: r.id, ...(r.data as Record<string, unknown>) }))
        .filter((r) => String(r.courseCode ?? '').toUpperCase() === t.code.toUpperCase() || String(r.subject ?? r.topic ?? '').toLowerCase().includes(t.name.toLowerCase()))
        .map((r) => ({ id: `cat:${r.rid}`, kind: 'Curated', title: String(r.title ?? 'Resource'), source: String(r.source ?? ''), type: String(r.resourceType ?? 'notes'), url: typeof r.url === 'string' ? r.url : null, size: r.estimatedMinutes ? `${r.estimatedMinutes} min` : null }));
      const q = encodeURIComponent(t.name);
      const open = [
        { id: `swayam:${t.code}`, kind: 'SWAYAM', title: `${t.name} — free courses on SWAYAM`, source: 'Ministry of Education, Govt. of India', type: 'course', url: `https://swayam.gov.in/explorer?searchText=${q}`, size: null },
        { id: `nptel:${t.code}`, kind: 'NPTEL', title: `${t.name} — NPTEL video lectures`, source: 'NPTEL (IITs and IISc)', type: 'video', url: `https://www.youtube.com/@nptelhrd/search?query=${q}`, size: null },
      ];
      return { subject: { code: t.code, name: t.name }, basis: t.basis, percent: t.percent, level: t.level, resources: [...fromTeachers, ...curated, ...open] };
    });

    res.json({
      student: { id: studentId, name: student.name, enrolmentNo: student.enrolmentNo, programme: `${student.programme.shortName} Sem ${student.semester}` },
      subjects: needs.map(({ id: _id, ...n }) => n),
      plan,
      note: projection && projection.subjects.length
        ? `Judged on approved internal marks where a sheet exists (${projection.subjects.length} subject${projection.subjects.length === 1 ? '' : 's'}), and on attendance elsewhere.`
        : 'No internal marks have been approved yet, so subjects are judged on attendance.',
    });
  }),
);
