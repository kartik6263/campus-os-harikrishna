-- CreateEnum
CREATE TYPE "AttendanceLeaveKind" AS ENUM ('MEDICAL', 'ON_DUTY', 'PERSONAL');

-- CreateEnum
CREATE TYPE "AttendanceLeaveStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CondonationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "attendance_policy" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "threshold" INTEGER NOT NULL DEFAULT 75,
    "condonationFloor" INTEGER NOT NULL DEFAULT 65,
    "warnBelow" INTEGER NOT NULL DEFAULT 80,
    "lateCountsAsPresent" BOOLEAN NOT NULL DEFAULT true,
    "leaveBackdateDays" INTEGER NOT NULL DEFAULT 15,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_policy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holidays" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_leaves" (
    "id" TEXT NOT NULL,
    "leaveNo" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "kind" "AttendanceLeaveKind" NOT NULL,
    "fromDate" TEXT NOT NULL,
    "toDate" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "proofFileId" TEXT,
    "status" "AttendanceLeaveStatus" NOT NULL DEFAULT 'PENDING',
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "excused" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_leaves_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_condonations" (
    "id" TEXT NOT NULL,
    "requestNo" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "percent" DOUBLE PRECISION NOT NULL,
    "kind" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "proofFileId" TEXT,
    "fee" INTEGER NOT NULL DEFAULT 0,
    "status" "CondonationStatus" NOT NULL DEFAULT 'PENDING',
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_condonations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "holidays_date_key" ON "holidays"("date");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_leaves_leaveNo_key" ON "attendance_leaves"("leaveNo");

-- CreateIndex
CREATE INDEX "attendance_leaves_studentId_idx" ON "attendance_leaves"("studentId");

-- CreateIndex
CREATE INDEX "attendance_leaves_status_idx" ON "attendance_leaves"("status");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_condonations_requestNo_key" ON "attendance_condonations"("requestNo");

-- CreateIndex
CREATE INDEX "attendance_condonations_status_idx" ON "attendance_condonations"("status");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_condonations_studentId_term_key" ON "attendance_condonations"("studentId", "term");

-- AddForeignKey
ALTER TABLE "attendance_leaves" ADD CONSTRAINT "attendance_leaves_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_condonations" ADD CONSTRAINT "attendance_condonations_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- The rules every institute starts with: 75% to sit an exam, condonable down to 65%.
INSERT INTO "attendance_policy" ("id", "updatedAt") VALUES ('default', CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
