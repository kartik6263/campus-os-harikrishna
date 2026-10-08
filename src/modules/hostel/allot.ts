import type { Prisma } from '@prisma/client';
import { ApiError } from '../../lib/http.js';
import { academicYear, bedLabels, conflictOnUnique, genderFits, nextNo } from './shared.js';

/**
 * Putting a student in a bed, taking them out, and moving them — the only
 * three ways an allotment changes. Each runs inside the caller's
 * transaction, checks everything it depends on, and leaves the database's
 * own unique keys (one active bed per student, one student per bed) as the
 * final guard against two wardens acting at once.
 */

export interface AllotInput {
  studentId: string;
  roomId: string;
  bed?: string;
  by: string;
  applicationId?: string | null;
  note?: string;
}

export async function allot(tx: Prisma.TransactionClient, input: AllotInput) {
  const [student, room] = await Promise.all([
    tx.student.findUnique({ where: { id: input.studentId }, select: { id: true, name: true, gender: true, status: true } }),
    tx.hostelRoom.findUnique({ where: { id: input.roomId }, include: { hostel: true, allotments: { where: { status: 'ACTIVE' }, select: { bed: true } } } }),
  ]);
  if (!student) throw ApiError.notFound('No such student');
  if (!room) throw ApiError.notFound('No such room');
  if (student.status !== 'ACTIVE') throw ApiError.conflict(`${student.name} is not on the rolls (${student.status.toLowerCase().replace('_', ' ')})`);
  if (!room.hostel.active) throw ApiError.conflict(`${room.hostel.name} is closed`);
  if (room.status !== 'AVAILABLE') throw ApiError.conflict(`Room ${room.roomNo} is ${room.status.toLowerCase()}`);
  const fits = genderFits(room.hostel.gender, student.gender);
  if (!fits.ok) throw ApiError.conflict(`${student.name}: ${fits.why}`);

  const taken = new Set(room.allotments.map((a) => a.bed));
  const free = bedLabels(room.capacity).filter((b) => !taken.has(b));
  if (free.length === 0) throw ApiError.conflict(`Room ${room.roomNo} is full`);
  const bed = input.bed ?? free[0]!;
  if (!bedLabels(room.capacity).includes(bed)) throw ApiError.badRequest(`Room ${room.roomNo} has beds ${bedLabels(room.capacity).join(', ')}`);
  if (taken.has(bed)) throw ApiError.conflict(`Bed ${bed} of room ${room.roomNo} is taken`);

  const year = new Date().getFullYear();
  const allotmentNo = await nextNo((p) => tx.hostelAllotment.findMany({ where: { allotmentNo: { startsWith: p } }, select: { allotmentNo: true } }), 'allotmentNo', `HA/${room.hostel.code}/${year}/`, 5);
  let created;
  try {
    created = await tx.hostelAllotment.create({
      data: {
        allotmentNo, studentId: student.id, roomId: room.id, bed, academicYear: academicYear(),
        activeStudent: student.id, activeBed: `${room.id}:${bed}`, allottedBy: input.by, applicationId: input.applicationId ?? null,
      },
    });
  } catch (err) {
    conflictOnUnique(err, `${student.name} already has a bed, or bed ${bed} was just taken — refresh and try again`);
  }
  if (input.applicationId) {
    await tx.hostelApplication.update({ where: { id: input.applicationId }, data: { status: 'ALLOTTED', decidedBy: input.by, decidedAt: new Date(), decisionNote: input.note ?? null } });
  }
  await tx.notification.create({
    data: {
      studentId: student.id, kind: 'GENERAL', title: `Hostel room allotted — ${room.hostel.name}, room ${room.roomNo}`,
      body: `Bed ${bed}, ${room.hostel.name}. Allotment ${allotmentNo}. Report to the warden${room.hostel.wardenName ? ` (${room.hostel.wardenName})` : ''} to check in.`,
      href: '/hostel',
    },
  });
  return { ...created, room };
}

export async function vacate(tx: Prisma.TransactionClient, allotmentId: string, by: string, reason: string, notify = true) {
  const a = await tx.hostelAllotment.findUnique({ where: { id: allotmentId }, include: { room: { include: { hostel: true } } } });
  if (!a) throw ApiError.notFound('No such allotment');
  if (a.status !== 'ACTIVE') throw ApiError.conflict('This allotment has already been vacated');
  const out = await tx.hostelAllotment.update({
    where: { id: a.id },
    data: { status: 'VACATED', activeStudent: null, activeBed: null, vacatedAt: new Date(), vacatedBy: by, vacateReason: reason },
  });
  // Anything they were still out on, or waiting for, ends with the stay.
  await tx.hostelLeave.updateMany({ where: { studentId: a.studentId, status: { in: ['AWAITING_PARENT', 'PENDING', 'APPROVED'] } }, data: { status: 'CANCELLED', decisionNote: 'Hostel vacated' } });
  await tx.hostelRoomChange.updateMany({ where: { allotmentId: a.id, status: 'PENDING' }, data: { status: 'CANCELLED', decisionNote: 'Hostel vacated' } });
  if (notify) {
    await tx.notification.create({ data: { studentId: a.studentId, kind: 'GENERAL', title: `Hostel room ${a.room.roomNo} vacated`, body: reason, href: '/hostel' } });
  }
  return { ...out, room: a.room };
}

/** Moves a resident to another room in one step: the old bed frees as the new one fills. */
export async function transfer(tx: Prisma.TransactionClient, allotmentId: string, toRoomId: string, by: string, reason: string, bed?: string) {
  const a = await tx.hostelAllotment.findUnique({ where: { id: allotmentId }, select: { studentId: true, roomId: true, status: true } });
  if (!a) throw ApiError.notFound('No such allotment');
  if (a.status !== 'ACTIVE') throw ApiError.conflict('This allotment has already been vacated');
  if (a.roomId === toRoomId && !bed) throw ApiError.badRequest('That is the room the student is already in');
  await vacate(tx, allotmentId, by, `Moved: ${reason}`, false);
  return allot(tx, { studentId: a.studentId, roomId: toRoomId, bed, by, note: reason });
}
