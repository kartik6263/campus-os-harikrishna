-- CreateEnum
CREATE TYPE "PaymentKind" AS ENUM ('RECEIPT', 'CONCESSION', 'REFUND');

-- CreateEnum
CREATE TYPE "ConcessionKind" AS ENUM ('MERIT', 'NEED_BASED', 'SIBLING', 'STAFF_WARD', 'SPORTS', 'SCHOLARSHIP', 'OTHER');

-- CreateEnum
CREATE TYPE "FeeDecision" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('REQUESTED', 'APPROVED', 'PAID', 'REJECTED');

-- CreateEnum
CREATE TYPE "UfmStatus" AS ENUM ('REPORTED', 'DECIDED');

-- CreateEnum
CREATE TYPE "UfmDecision" AS ENUM ('WARNING', 'PAPER_CANCELLED', 'SESSION_CANCELLED', 'DEBARRED');

-- AlterEnum
ALTER TYPE "PaymentStatus" ADD VALUE 'CANCELLED';

-- AlterEnum
ALTER TYPE "ReceiptStatus" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "fee_items" ADD COLUMN     "fineFor" TEXT;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledBy" TEXT,
ADD COLUMN     "kind" "PaymentKind" NOT NULL DEFAULT 'RECEIPT';

-- AlterTable
ALTER TABLE "answer_bundles" ADD COLUMN     "examinerId" TEXT;

-- CreateTable
CREATE TABLE "fee_allocations" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "feeItemId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fee_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_structures" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "programmeId" TEXT NOT NULL,
    "semester" INTEGER NOT NULL,
    "term" TEXT NOT NULL,
    "heads" JSONB NOT NULL,
    "instalments" JSONB NOT NULL DEFAULT '[]',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "appliedAt" TIMESTAMP(3),
    "appliedTo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "fee_structures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_concessions" (
    "id" TEXT NOT NULL,
    "concessionNo" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "feeItemId" TEXT NOT NULL,
    "kind" "ConcessionKind" NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "proofFileId" TEXT,
    "status" "FeeDecision" NOT NULL DEFAULT 'PENDING',
    "requestedBy" TEXT NOT NULL,
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "paymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fee_concessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_refunds" (
    "id" TEXT NOT NULL,
    "refundNo" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "feeItemId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedBy" TEXT NOT NULL,
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "payoutMode" TEXT,
    "payoutRef" TEXT,
    "paidBy" TEXT,
    "paidAt" TIMESTAMP(3),
    "paymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fee_refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_day_closes" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "expectedCash" INTEGER NOT NULL,
    "countedCash" INTEGER NOT NULL,
    "difference" INTEGER NOT NULL,
    "totals" JSONB NOT NULL,
    "remarks" TEXT,
    "closedBy" TEXT NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fee_day_closes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "examiners" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "designation" TEXT NOT NULL,
    "institution" TEXT NOT NULL,
    "subjects" TEXT NOT NULL DEFAULT '',
    "mobile" TEXT,
    "email" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "examiners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "malpractice_cases" (
    "id" TEXT NOT NULL,
    "caseNo" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "paperId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "evidenceFileId" TEXT,
    "reportedBy" TEXT NOT NULL,
    "status" "UfmStatus" NOT NULL DEFAULT 'REPORTED',
    "decision" "UfmDecision",
    "decisionNote" TEXT,
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "malpractice_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backlog_results" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "semester" INTEGER NOT NULL,
    "internal" INTEGER NOT NULL,
    "external" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "grade" TEXT NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "applied" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "backlog_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fee_allocations_paymentId_idx" ON "fee_allocations"("paymentId");

-- CreateIndex
CREATE INDEX "fee_allocations_feeItemId_idx" ON "fee_allocations"("feeItemId");

-- CreateIndex
CREATE UNIQUE INDEX "fee_structures_programmeId_semester_term_key" ON "fee_structures"("programmeId", "semester", "term");

-- CreateIndex
CREATE UNIQUE INDEX "fee_concessions_concessionNo_key" ON "fee_concessions"("concessionNo");

-- CreateIndex
CREATE INDEX "fee_concessions_status_idx" ON "fee_concessions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "fee_refunds_refundNo_key" ON "fee_refunds"("refundNo");

-- CreateIndex
CREATE INDEX "fee_refunds_status_idx" ON "fee_refunds"("status");

-- CreateIndex
CREATE UNIQUE INDEX "fee_day_closes_date_key" ON "fee_day_closes"("date");

-- CreateIndex
CREATE UNIQUE INDEX "malpractice_cases_caseNo_key" ON "malpractice_cases"("caseNo");

-- CreateIndex
CREATE INDEX "malpractice_cases_sessionId_idx" ON "malpractice_cases"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "malpractice_cases_paperId_studentId_key" ON "malpractice_cases"("paperId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "backlog_results_sessionId_studentId_subjectId_key" ON "backlog_results"("sessionId", "studentId", "subjectId");

-- AddForeignKey
ALTER TABLE "answer_bundles" ADD CONSTRAINT "answer_bundles_examinerId_fkey" FOREIGN KEY ("examinerId") REFERENCES "examiners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_allocations" ADD CONSTRAINT "fee_allocations_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_allocations" ADD CONSTRAINT "fee_allocations_feeItemId_fkey" FOREIGN KEY ("feeItemId") REFERENCES "fee_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_concessions" ADD CONSTRAINT "fee_concessions_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_concessions" ADD CONSTRAINT "fee_concessions_feeItemId_fkey" FOREIGN KEY ("feeItemId") REFERENCES "fee_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_refunds" ADD CONSTRAINT "fee_refunds_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_refunds" ADD CONSTRAINT "fee_refunds_feeItemId_fkey" FOREIGN KEY ("feeItemId") REFERENCES "fee_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "malpractice_cases" ADD CONSTRAINT "malpractice_cases_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "exam_papers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "malpractice_cases" ADD CONSTRAINT "malpractice_cases_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backlog_results" ADD CONSTRAINT "backlog_results_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Credits recorded before this release were negative payments; they are concessions, not money received.
UPDATE "payments" SET "kind" = 'CONCESSION' WHERE "amount" < 0;
