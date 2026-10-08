-- CreateEnum
CREATE TYPE "StudentStatus" AS ENUM ('ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'DETAINED', 'WITHDRAWN', 'TRANSFERRED', 'RUSTICATED', 'GRADUATED');

-- CreateEnum
CREATE TYPE "LifecycleEventKind" AS ENUM ('ADMITTED', 'PROMOTED', 'DETAINED', 'LEAVE_STARTED', 'RESUMED', 'SUSPENDED', 'REINSTATED', 'WITHDRAWN', 'TRANSFERRED', 'RUSTICATED', 'READMITTED', 'GRADUATED', 'CLEARANCE');

-- CreateEnum
CREATE TYPE "LifecycleRequestKind" AS ENUM ('BREAK_OF_STUDY', 'RESUME', 'WITHDRAWAL', 'TRANSFER');

-- CreateEnum
CREATE TYPE "LifecycleRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- AlterTable
ALTER TABLE "students" ADD COLUMN     "graduatedOn" TIMESTAMP(3),
ADD COLUMN     "status" "StudentStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "statusSince" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "lifecycle_events" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "kind" "LifecycleEventKind" NOT NULL,
    "fromStatus" "StudentStatus",
    "toStatus" "StudentStatus",
    "fromSemester" INTEGER,
    "toSemester" INTEGER,
    "term" TEXT,
    "reason" TEXT NOT NULL,
    "reference" TEXT,
    "effectiveOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT,
    "actorName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lifecycle_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lifecycle_requests" (
    "id" TEXT NOT NULL,
    "requestNo" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "kind" "LifecycleRequestKind" NOT NULL,
    "reason" TEXT NOT NULL,
    "destination" TEXT,
    "returnBy" TIMESTAMP(3),
    "status" "LifecycleRequestStatus" NOT NULL DEFAULT 'PENDING',
    "decisionNote" TEXT,
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lifecycle_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "no_dues_clearances" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "cleared" BOOLEAN NOT NULL DEFAULT true,
    "remarks" TEXT,
    "clearedBy" TEXT NOT NULL,
    "clearedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "no_dues_clearances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lifecycle_events_studentId_createdAt_idx" ON "lifecycle_events"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "lifecycle_events_kind_createdAt_idx" ON "lifecycle_events"("kind", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "lifecycle_requests_requestNo_key" ON "lifecycle_requests"("requestNo");

-- CreateIndex
CREATE INDEX "lifecycle_requests_status_createdAt_idx" ON "lifecycle_requests"("status", "createdAt");

-- CreateIndex
CREATE INDEX "lifecycle_requests_studentId_idx" ON "lifecycle_requests"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "no_dues_clearances_studentId_department_key" ON "no_dues_clearances"("studentId", "department");

-- CreateIndex
CREATE INDEX "students_status_idx" ON "students"("status");

-- AddForeignKey
ALTER TABLE "lifecycle_events" ADD CONSTRAINT "lifecycle_events_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lifecycle_requests" ADD CONSTRAINT "lifecycle_requests_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "no_dues_clearances" ADD CONSTRAINT "no_dues_clearances_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Students already on the rolls have been active since they were admitted.
UPDATE "students" SET "statusSince" = "createdAt";
