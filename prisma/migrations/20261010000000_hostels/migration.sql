-- CreateEnum
CREATE TYPE "HostelGender" AS ENUM ('BOYS', 'GIRLS', 'CO_ED');

-- CreateEnum
CREATE TYPE "HostelRoomStatus" AS ENUM ('AVAILABLE', 'MAINTENANCE', 'BLOCKED');

-- CreateEnum
CREATE TYPE "HostelApplicationStatus" AS ENUM ('PENDING', 'WAITLISTED', 'ALLOTTED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "HostelAllotmentStatus" AS ENUM ('ACTIVE', 'VACATED');

-- CreateEnum
CREATE TYPE "HostelRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "HostelComplaintStatus" AS ENUM ('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "HostelComplaintPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "HostelLeaveKind" AS ENUM ('GATE_PASS', 'LEAVE');

-- CreateEnum
CREATE TYPE "HostelLeaveStatus" AS ENUM ('AWAITING_PARENT', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'OUT', 'RETURNED');

-- CreateEnum
CREATE TYPE "ParentConsent" AS ENUM ('PENDING', 'GIVEN', 'REFUSED', 'NOT_REQUIRED');

-- CreateEnum
CREATE TYPE "RollCallStatus" AS ENUM ('PRESENT', 'ABSENT', 'ON_LEAVE');

-- CreateTable
CREATE TABLE "hostels" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gender" "HostelGender" NOT NULL,
    "address" TEXT,
    "wardenName" TEXT,
    "wardenPhone" TEXT,
    "amenities" TEXT[],
    "rules" TEXT,
    "messRatePerMonth" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hostels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hostel_rooms" (
    "id" TEXT NOT NULL,
    "hostelId" TEXT NOT NULL,
    "roomNo" TEXT NOT NULL,
    "floor" INTEGER NOT NULL DEFAULT 0,
    "capacity" INTEGER NOT NULL,
    "ac" BOOLEAN NOT NULL DEFAULT false,
    "attachedBath" BOOLEAN NOT NULL DEFAULT false,
    "amenities" TEXT[],
    "rentPerSemester" INTEGER NOT NULL DEFAULT 0,
    "status" "HostelRoomStatus" NOT NULL DEFAULT 'AVAILABLE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hostel_rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hostel_applications" (
    "id" TEXT NOT NULL,
    "applicationNo" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "academicYear" TEXT NOT NULL,
    "preferredHostelId" TEXT,
    "roomPreference" TEXT NOT NULL DEFAULT 'ANY',
    "distanceKm" INTEGER NOT NULL DEFAULT 0,
    "specialNeeds" TEXT,
    "reason" TEXT NOT NULL,
    "priorityScore" INTEGER NOT NULL DEFAULT 0,
    "status" "HostelApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "decisionNote" TEXT,
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hostel_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hostel_allotments" (
    "id" TEXT NOT NULL,
    "allotmentNo" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "bed" TEXT NOT NULL,
    "status" "HostelAllotmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "activeStudent" TEXT,
    "activeBed" TEXT,
    "academicYear" TEXT NOT NULL,
    "allottedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "allottedBy" TEXT NOT NULL,
    "checkedInAt" TIMESTAMP(3),
    "vacatedAt" TIMESTAMP(3),
    "vacatedBy" TEXT,
    "vacateReason" TEXT,
    "applicationId" TEXT,

    CONSTRAINT "hostel_allotments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hostel_room_changes" (
    "id" TEXT NOT NULL,
    "requestNo" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "allotmentId" TEXT NOT NULL,
    "preferredRoomId" TEXT,
    "reason" TEXT NOT NULL,
    "status" "HostelRequestStatus" NOT NULL DEFAULT 'PENDING',
    "decisionNote" TEXT,
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hostel_room_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hostel_complaints" (
    "id" TEXT NOT NULL,
    "ticketNo" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "hostelId" TEXT NOT NULL,
    "roomId" TEXT,
    "category" TEXT NOT NULL,
    "priority" "HostelComplaintPriority" NOT NULL DEFAULT 'NORMAL',
    "description" TEXT NOT NULL,
    "status" "HostelComplaintStatus" NOT NULL DEFAULT 'OPEN',
    "assignedTo" TEXT,
    "response" TEXT,
    "dueBy" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "rating" INTEGER,
    "feedback" TEXT,
    "reopened" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hostel_complaints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hostel_leaves" (
    "id" TEXT NOT NULL,
    "passNo" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "kind" "HostelLeaveKind" NOT NULL,
    "leaveFrom" TIMESTAMP(3) NOT NULL,
    "leaveTo" TIMESTAMP(3) NOT NULL,
    "destination" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "HostelLeaveStatus" NOT NULL DEFAULT 'PENDING',
    "parentConsent" "ParentConsent" NOT NULL DEFAULT 'NOT_REQUIRED',
    "parentNote" TEXT,
    "decisionNote" TEXT,
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "outAt" TIMESTAMP(3),
    "returnedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hostel_leaves_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hostel_visitors" (
    "id" TEXT NOT NULL,
    "hostelId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "visitorName" TEXT NOT NULL,
    "relation" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "idProof" TEXT,
    "purpose" TEXT NOT NULL,
    "inAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "outAt" TIMESTAMP(3),
    "recordedBy" TEXT NOT NULL,

    CONSTRAINT "hostel_visitors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hostel_mess_menu" (
    "id" TEXT NOT NULL,
    "hostelId" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "breakfast" TEXT NOT NULL,
    "lunch" TEXT NOT NULL,
    "snacks" TEXT NOT NULL DEFAULT '',
    "dinner" TEXT NOT NULL,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hostel_mess_menu_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hostel_roll_calls" (
    "id" TEXT NOT NULL,
    "hostelId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "status" "RollCallStatus" NOT NULL,
    "markedBy" TEXT NOT NULL,
    "markedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hostel_roll_calls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hostel_bill_runs" (
    "id" TEXT NOT NULL,
    "hostelId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "rate" INTEGER,
    "charged" INTEGER NOT NULL,
    "skipped" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "runBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hostel_bill_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hostels_code_key" ON "hostels"("code");

-- CreateIndex
CREATE UNIQUE INDEX "hostel_rooms_hostelId_roomNo_key" ON "hostel_rooms"("hostelId", "roomNo");

-- CreateIndex
CREATE UNIQUE INDEX "hostel_applications_applicationNo_key" ON "hostel_applications"("applicationNo");

-- CreateIndex
CREATE INDEX "hostel_applications_status_priorityScore_idx" ON "hostel_applications"("status", "priorityScore");

-- CreateIndex
CREATE INDEX "hostel_applications_studentId_idx" ON "hostel_applications"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "hostel_allotments_allotmentNo_key" ON "hostel_allotments"("allotmentNo");

-- CreateIndex
CREATE UNIQUE INDEX "hostel_allotments_activeStudent_key" ON "hostel_allotments"("activeStudent");

-- CreateIndex
CREATE UNIQUE INDEX "hostel_allotments_activeBed_key" ON "hostel_allotments"("activeBed");

-- CreateIndex
CREATE UNIQUE INDEX "hostel_allotments_applicationId_key" ON "hostel_allotments"("applicationId");

-- CreateIndex
CREATE INDEX "hostel_allotments_roomId_status_idx" ON "hostel_allotments"("roomId", "status");

-- CreateIndex
CREATE INDEX "hostel_allotments_studentId_idx" ON "hostel_allotments"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "hostel_room_changes_requestNo_key" ON "hostel_room_changes"("requestNo");

-- CreateIndex
CREATE INDEX "hostel_room_changes_status_idx" ON "hostel_room_changes"("status");

-- CreateIndex
CREATE UNIQUE INDEX "hostel_complaints_ticketNo_key" ON "hostel_complaints"("ticketNo");

-- CreateIndex
CREATE INDEX "hostel_complaints_hostelId_status_idx" ON "hostel_complaints"("hostelId", "status");

-- CreateIndex
CREATE INDEX "hostel_complaints_studentId_idx" ON "hostel_complaints"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "hostel_leaves_passNo_key" ON "hostel_leaves"("passNo");

-- CreateIndex
CREATE INDEX "hostel_leaves_status_leaveTo_idx" ON "hostel_leaves"("status", "leaveTo");

-- CreateIndex
CREATE INDEX "hostel_leaves_studentId_idx" ON "hostel_leaves"("studentId");

-- CreateIndex
CREATE INDEX "hostel_visitors_hostelId_inAt_idx" ON "hostel_visitors"("hostelId", "inAt");

-- CreateIndex
CREATE UNIQUE INDEX "hostel_mess_menu_hostelId_day_key" ON "hostel_mess_menu"("hostelId", "day");

-- CreateIndex
CREATE INDEX "hostel_roll_calls_hostelId_date_idx" ON "hostel_roll_calls"("hostelId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "hostel_roll_calls_hostelId_studentId_date_key" ON "hostel_roll_calls"("hostelId", "studentId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "hostel_bill_runs_hostelId_kind_period_key" ON "hostel_bill_runs"("hostelId", "kind", "period");

-- AddForeignKey
ALTER TABLE "hostel_rooms" ADD CONSTRAINT "hostel_rooms_hostelId_fkey" FOREIGN KEY ("hostelId") REFERENCES "hostels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hostel_applications" ADD CONSTRAINT "hostel_applications_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hostel_applications" ADD CONSTRAINT "hostel_applications_preferredHostelId_fkey" FOREIGN KEY ("preferredHostelId") REFERENCES "hostels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hostel_allotments" ADD CONSTRAINT "hostel_allotments_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hostel_allotments" ADD CONSTRAINT "hostel_allotments_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "hostel_rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hostel_allotments" ADD CONSTRAINT "hostel_allotments_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "hostel_applications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hostel_room_changes" ADD CONSTRAINT "hostel_room_changes_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hostel_room_changes" ADD CONSTRAINT "hostel_room_changes_allotmentId_fkey" FOREIGN KEY ("allotmentId") REFERENCES "hostel_allotments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hostel_room_changes" ADD CONSTRAINT "hostel_room_changes_preferredRoomId_fkey" FOREIGN KEY ("preferredRoomId") REFERENCES "hostel_rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hostel_complaints" ADD CONSTRAINT "hostel_complaints_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hostel_complaints" ADD CONSTRAINT "hostel_complaints_hostelId_fkey" FOREIGN KEY ("hostelId") REFERENCES "hostels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hostel_complaints" ADD CONSTRAINT "hostel_complaints_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "hostel_rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hostel_leaves" ADD CONSTRAINT "hostel_leaves_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hostel_visitors" ADD CONSTRAINT "hostel_visitors_hostelId_fkey" FOREIGN KEY ("hostelId") REFERENCES "hostels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hostel_visitors" ADD CONSTRAINT "hostel_visitors_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hostel_mess_menu" ADD CONSTRAINT "hostel_mess_menu_hostelId_fkey" FOREIGN KEY ("hostelId") REFERENCES "hostels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hostel_roll_calls" ADD CONSTRAINT "hostel_roll_calls_hostelId_fkey" FOREIGN KEY ("hostelId") REFERENCES "hostels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hostel_roll_calls" ADD CONSTRAINT "hostel_roll_calls_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hostel_bill_runs" ADD CONSTRAINT "hostel_bill_runs_hostelId_fkey" FOREIGN KEY ("hostelId") REFERENCES "hostels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

