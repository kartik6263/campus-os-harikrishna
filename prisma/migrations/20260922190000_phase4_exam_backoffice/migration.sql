-- CreateEnum
CREATE TYPE "ExamSessionStatus" AS ENUM ('PLANNED', 'FORM_WINDOW_OPEN', 'FORM_WINDOW_CLOSED', 'IN_PROGRESS', 'EVALUATION', 'RESULT_PROCESSING', 'RESULT_PUBLISHED');

-- CreateEnum
CREATE TYPE "BundleStatus" AS ENUM ('UNASSIGNED', 'RECEIVED', 'UNDER_EVALUATION', 'SUBMITTED', 'MODERATED');

-- CreateEnum
CREATE TYPE "ExaminerRole" AS ENUM ('E1', 'E2', 'MODERATOR');

-- CreateEnum
CREATE TYPE "RevaluationStatus" AS ENUM ('APPLIED', 'UNDER_REVALUATION', 'COMPLETED', 'REJECTED');

-- AlterTable
ALTER TABLE "semester_results" ADD COLUMN     "division" TEXT,
ADD COLUMN     "graceMarks" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "published" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "sessionId" TEXT;

-- AlterTable
ALTER TABLE "subject_results" ADD COLUMN     "graceGiven" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "exam_sessions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "academicYear" TEXT NOT NULL,
    "status" "ExamSessionStatus" NOT NULL DEFAULT 'PLANNED',
    "formOpensOn" TIMESTAMP(3) NOT NULL,
    "formClosesOn" TIMESTAMP(3) NOT NULL,
    "lateClosesOn" TIMESTAMP(3) NOT NULL,
    "examStartsOn" TIMESTAMP(3) NOT NULL,
    "examEndsOn" TIMESTAMP(3) NOT NULL,
    "resultTargetOn" TIMESTAMP(3) NOT NULL,
    "regularFee" INTEGER NOT NULL DEFAULT 1800,
    "lateFee" INTEGER NOT NULL DEFAULT 500,
    "backlogFee" INTEGER NOT NULL DEFAULT 300,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exam_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_centres" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "pincode" TEXT,
    "capacity" INTEGER NOT NULL,

    CONSTRAINT "exam_centres_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seat_allocations" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "centreId" TEXT NOT NULL,
    "seatNo" TEXT,
    "allocatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seat_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_papers" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "examDate" TIMESTAMP(3) NOT NULL,
    "examTime" TEXT NOT NULL DEFAULT '10:00–13:00',
    "maxExternal" INTEGER NOT NULL DEFAULT 70,
    "maxInternal" INTEGER NOT NULL DEFAULT 30,
    "dispatchedAt" TIMESTAMP(3),

    CONSTRAINT "exam_papers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "answer_bundles" (
    "id" TEXT NOT NULL,
    "bundleNo" TEXT NOT NULL,
    "paperId" TEXT NOT NULL,
    "centreId" TEXT NOT NULL,
    "status" "BundleStatus" NOT NULL DEFAULT 'UNASSIGNED',
    "examinerName" TEXT,
    "examinerRole" "ExaminerRole" NOT NULL DEFAULT 'E1',
    "assignedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),

    CONSTRAINT "answer_bundles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "answer_scripts" (
    "id" TEXT NOT NULL,
    "paperId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "bundleId" TEXT,
    "e1" INTEGER,
    "e2" INTEGER,
    "moderatorMark" INTEGER,
    "finalMark" INTEGER,
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "flagReason" TEXT,
    "absent" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "answer_scripts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "revaluation_applications" (
    "id" TEXT NOT NULL,
    "applicationNo" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "paperId" TEXT NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fee" INTEGER NOT NULL DEFAULT 500,
    "feePaid" BOOLEAN NOT NULL DEFAULT false,
    "status" "RevaluationStatus" NOT NULL DEFAULT 'APPLIED',
    "originalMark" INTEGER,
    "revisedMark" INTEGER,
    "changed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "remarks" TEXT,

    CONSTRAINT "revaluation_applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "exam_sessions_code_key" ON "exam_sessions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "exam_centres_code_key" ON "exam_centres"("code");

-- CreateIndex
CREATE INDEX "seat_allocations_centreId_idx" ON "seat_allocations"("centreId");

-- CreateIndex
CREATE UNIQUE INDEX "seat_allocations_sessionId_studentId_key" ON "seat_allocations"("sessionId", "studentId");

-- CreateIndex
CREATE INDEX "exam_papers_examDate_idx" ON "exam_papers"("examDate");

-- CreateIndex
CREATE UNIQUE INDEX "exam_papers_sessionId_subjectId_key" ON "exam_papers"("sessionId", "subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "answer_bundles_bundleNo_key" ON "answer_bundles"("bundleNo");

-- CreateIndex
CREATE INDEX "answer_bundles_paperId_status_idx" ON "answer_bundles"("paperId", "status");

-- CreateIndex
CREATE INDEX "answer_scripts_flagged_idx" ON "answer_scripts"("flagged");

-- CreateIndex
CREATE UNIQUE INDEX "answer_scripts_paperId_studentId_key" ON "answer_scripts"("paperId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "revaluation_applications_applicationNo_key" ON "revaluation_applications"("applicationNo");

-- CreateIndex
CREATE INDEX "revaluation_applications_status_idx" ON "revaluation_applications"("status");

-- CreateIndex
CREATE UNIQUE INDEX "revaluation_applications_studentId_paperId_key" ON "revaluation_applications"("studentId", "paperId");

-- AddForeignKey
ALTER TABLE "semester_results" ADD CONSTRAINT "semester_results_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "exam_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seat_allocations" ADD CONSTRAINT "seat_allocations_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "exam_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seat_allocations" ADD CONSTRAINT "seat_allocations_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seat_allocations" ADD CONSTRAINT "seat_allocations_centreId_fkey" FOREIGN KEY ("centreId") REFERENCES "exam_centres"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_papers" ADD CONSTRAINT "exam_papers_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "exam_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_papers" ADD CONSTRAINT "exam_papers_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answer_bundles" ADD CONSTRAINT "answer_bundles_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "exam_papers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answer_bundles" ADD CONSTRAINT "answer_bundles_centreId_fkey" FOREIGN KEY ("centreId") REFERENCES "exam_centres"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answer_scripts" ADD CONSTRAINT "answer_scripts_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "exam_papers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answer_scripts" ADD CONSTRAINT "answer_scripts_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answer_scripts" ADD CONSTRAINT "answer_scripts_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "answer_bundles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revaluation_applications" ADD CONSTRAINT "revaluation_applications_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revaluation_applications" ADD CONSTRAINT "revaluation_applications_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "exam_papers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

