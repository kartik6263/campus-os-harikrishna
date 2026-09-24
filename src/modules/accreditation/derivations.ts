import { prisma } from '../../db.js';
import { overallAttendance } from '../faculty/shared.js';
import { ATTENDANCE_THRESHOLD } from '../student.js';

/**
 * What a derived metric answers with.
 *
 * `basis` is the point of the whole register: an assessor's first question is
 * never the number, it is where the number came from. Every derivation says
 * which rows it counted, so the answer can be defended rather than asserted.
 */
export interface Derived {
  value: string;
  numeric: number | null;
  basis: string;
}

type Derivation = (collegeId: string) => Promise<Derived>;

const pct = (n: number, d: number) => (d === 0 ? 0 : Number(((n / d) * 100).toFixed(1)));

/**
 * The computations a metric can name.
 *
 * Adding a framework question that one of these answers is a data change, not
 * a code change — the metric row names the key and the register does the rest.
 */
export const DERIVATIONS: Record<string, Derivation> = {
  // ── Enrolment ─────────────────────────────────────────────────────────────

  enrolment_total: async (collegeId) => {
    const n = await prisma.student.count({ where: { collegeId } });
    return { value: String(n), numeric: n, basis: `${n} student records on the roll` };
  },

  programmes_offered: async (collegeId) => {
    const n = await prisma.programme.count({ where: { collegeId } });
    return { value: String(n), numeric: n, basis: `${n} programmes attached to this college` };
  },

  women_students: async (collegeId) => {
    const [total, women] = await Promise.all([
      prisma.student.count({ where: { collegeId } }),
      prisma.student.count({ where: { collegeId, gender: 'Female' } }),
    ]);
    const p = pct(women, total);
    return {
      value: `${p}%`,
      numeric: p,
      basis: `${women} of ${total} students recorded as female`,
    };
  },

  reserved_category_students: async (collegeId) => {
    const [total, reserved] = await Promise.all([
      prisma.student.count({ where: { collegeId } }),
      prisma.student.count({
        where: { collegeId, category: { notIn: ['General'], not: null } },
      }),
    ]);
    const p = pct(reserved, total);
    return {
      value: `${p}%`,
      numeric: p,
      basis: `${reserved} of ${total} students in SC, ST, OBC or another reserved category`,
    };
  },

  // ── Staff ─────────────────────────────────────────────────────────────────

  student_teacher_ratio: async (collegeId) => {
    const [students, teachers] = await Promise.all([
      prisma.student.count({ where: { collegeId } }),
      prisma.faculty.count({ where: { collegeId } }),
    ]);
    if (teachers === 0) {
      return { value: '—', numeric: null, basis: 'No teaching staff on record' };
    }
    const ratio = Number((students / teachers).toFixed(1));
    return {
      value: `${ratio}:1`,
      numeric: ratio,
      basis: `${students} students against ${teachers} teaching posts`,
    };
  },

  teaching_load_utilisation: async (collegeId) => {
    const staff = await prisma.faculty.findMany({
      where: { collegeId },
      select: {
        maxWeeklyLoad: true,
        timetableSlots: { where: { cancelled: false }, select: { startTime: true, endTime: true } },
      },
    });

    const hours = (start: string, end: string) => {
      const mins = (t: string) => {
        const [h = 0, m = 0] = t.split(':').map(Number);
        return h * 60 + m;
      };
      let span = mins(end) - mins(start);
      if (span <= 0) span += 12 * 60;
      return span / 60;
    };

    const allotted = staff.reduce(
      (sum, f) => sum + f.timetableSlots.reduce((s, t) => s + hours(t.startTime, t.endTime), 0),
      0,
    );
    const sanctioned = staff.reduce((sum, f) => sum + f.maxWeeklyLoad, 0);
    const p = pct(allotted, sanctioned);

    return {
      value: `${p}%`,
      numeric: p,
      basis: `${allotted.toFixed(1)} of ${sanctioned} sanctioned weekly hours on the timetable`,
    };
  },

  // ── Teaching and evaluation ───────────────────────────────────────────────

  pass_percentage: async (collegeId) => {
    const results = await prisma.semesterResult.findMany({
      where: { student: { collegeId }, published: true },
      select: { studentId: true, semester: true, outcome: true },
      orderBy: { semester: 'desc' },
    });

    // The latest published result per student, so the figure is not inflated
    // by counting every semester a student has ever cleared.
    const latest = new Map<string, (typeof results)[number]>();
    for (const r of results) if (!latest.has(r.studentId)) latest.set(r.studentId, r);
    const rows = [...latest.values()];

    if (rows.length === 0) {
      return { value: '—', numeric: null, basis: 'No results have been published yet' };
    }

    const passed = rows.filter((r) => r.outcome === 'PASS').length;
    const p = pct(passed, rows.length);
    return {
      value: `${p}%`,
      numeric: p,
      basis: `${passed} of ${rows.length} candidates passed their most recent published examination`,
    };
  },

  average_attendance: async (collegeId) => {
    const students = await prisma.student.findMany({ where: { collegeId }, select: { id: true } });
    const attendance = await overallAttendance(students.map((s) => s.id));
    const values = [...attendance.values()].map((a) => a.percent).filter((p) => p > 0);

    if (values.length === 0) {
      return { value: '—', numeric: null, basis: 'No attendance has been marked' };
    }

    const avg = Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(1));
    return {
      value: `${avg}%`,
      numeric: avg,
      basis: `Mean of ${values.length} students' attendance, counted from marked class sessions`,
    };
  },

  students_meeting_attendance: async (collegeId) => {
    const students = await prisma.student.findMany({ where: { collegeId }, select: { id: true } });
    const attendance = await overallAttendance(students.map((s) => s.id));
    const values = [...attendance.values()].map((a) => a.percent).filter((p) => p > 0);
    const meeting = values.filter((p) => p >= ATTENDANCE_THRESHOLD).length;
    const p = pct(meeting, values.length);

    return {
      value: `${p}%`,
      numeric: p,
      basis: `${meeting} of ${values.length} students at or above the ${ATTENDANCE_THRESHOLD}% threshold`,
    };
  },

  internal_marks_approved: async (collegeId) => {
    const [total, approved] = await Promise.all([
      prisma.marksSheet.count({ where: { assignment: { faculty: { collegeId } } } }),
      prisma.marksSheet.count({
        where: { assignment: { faculty: { collegeId } }, status: 'APPROVED' },
      }),
    ]);
    if (total === 0) {
      return { value: '—', numeric: null, basis: 'No internal marks sheets have been opened' };
    }
    const p = pct(approved, total);
    return {
      value: `${p}%`,
      numeric: p,
      basis: `${approved} of ${total} marks sheets approved by a head of department`,
    };
  },

  // ── Student support ───────────────────────────────────────────────────────

  scholarship_beneficiaries: async (collegeId) => {
    const [total, awarded] = await Promise.all([
      prisma.student.count({ where: { collegeId } }),
      prisma.student.count({ where: { collegeId, scholarships: { some: {} } } }),
    ]);
    const p = pct(awarded, total);
    return {
      value: `${p}%`,
      numeric: p,
      basis: `${awarded} of ${total} students hold a scholarship award on the ledger`,
    };
  },

  fee_collection_rate: async (collegeId) => {
    const items = await prisma.feeItem.findMany({
      where: { student: { collegeId } },
      select: { amount: true, paid: true },
    });
    const charged = items.reduce((s, f) => s + f.amount, 0);
    const paid = items.reduce((s, f) => s + f.paid, 0);
    const p = pct(paid, charged);
    return {
      value: `${p}%`,
      numeric: p,
      basis: `₹${paid.toLocaleString('en-IN')} collected against ₹${charged.toLocaleString('en-IN')} charged`,
    };
  },

  certificates_within_sla: async (collegeId) => {
    const issued = await prisma.certificateRequest.findMany({
      where: { student: { collegeId }, issuedAt: { not: null } },
      select: { issuedAt: true, slaDeadline: true },
    });
    if (issued.length === 0) {
      return { value: '—', numeric: null, basis: 'No certificates have been issued yet' };
    }
    const onTime = issued.filter((c) => c.issuedAt! <= c.slaDeadline).length;
    const p = pct(onTime, issued.length);
    return {
      value: `${p}%`,
      numeric: p,
      basis: `${onTime} of ${issued.length} certificates issued on or before the promised date`,
    };
  },

  // ── Governance ────────────────────────────────────────────────────────────

  compliance_met: async (collegeId) => {
    const items = await prisma.complianceItem.findMany({
      where: { collegeId },
      select: { status: true },
    });
    if (items.length === 0) {
      return { value: '—', numeric: null, basis: 'The compliance file is empty' };
    }
    const met = items.filter((i) => i.status === 'COMPLIANT').length;
    const p = pct(met, items.length);
    return {
      value: `${p}%`,
      numeric: p,
      basis: `${met} of ${items.length} requirements in the affiliation file recorded as met`,
    };
  },
};

/** Whether a metric names a computation this build knows how to run. */
export const isKnownDerivation = (key: string | null): key is string =>
  !!key && key in DERIVATIONS;

/**
 * Runs every derivation a set of metrics names, once each.
 *
 * Several framework questions lean on the same figure — a student–teacher
 * ratio appears in both NAAC and NIRF — so the work is shared rather than
 * repeated per row.
 */
export async function runDerivations(keys: string[], collegeId: string) {
  const unique = [...new Set(keys.filter(isKnownDerivation))];
  const out = new Map<string, Derived>();

  await Promise.all(
    unique.map(async (key) => {
      try {
        out.set(key, await DERIVATIONS[key]!(collegeId));
      } catch (err) {
        // A derivation that throws is reported as unanswerable rather than
        // taking the whole register down with it.
        out.set(key, {
          value: '—',
          numeric: null,
          basis: `Could not be computed: ${err instanceof Error ? err.message : 'unknown error'}`,
        });
      }
    }),
  );

  return out;
}
