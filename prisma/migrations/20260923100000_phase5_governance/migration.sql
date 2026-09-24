-- CreateEnum
CREATE TYPE "ComplianceStatus" AS ENUM ('COMPLIANT', 'PARTIAL', 'NON_COMPLIANT', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "GovernanceKind" AS ENUM ('BUDGET', 'EVENT', 'INFRASTRUCTURE', 'PROCUREMENT', 'POLICY', 'OTHER');

-- CreateEnum
CREATE TYPE "GovernanceStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "GovernancePriority" AS ENUM ('LOW', 'NORMAL', 'HIGH');

-- CreateTable
CREATE TABLE "compliance_items" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "requirement" TEXT NOT NULL,
    "authority" TEXT NOT NULL,
    "status" "ComplianceStatus" NOT NULL DEFAULT 'NON_COMPLIANT',
    "evidence" TEXT,
    "remarks" TEXT,
    "dueOn" TIMESTAMP(3),
    "lastReviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "collegeId" TEXT NOT NULL,

    CONSTRAINT "compliance_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "governance_requests" (
    "id" TEXT NOT NULL,
    "requestNo" TEXT NOT NULL,
    "kind" "GovernanceKind" NOT NULL,
    "subject" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "amount" INTEGER,
    "priority" "GovernancePriority" NOT NULL DEFAULT 'NORMAL',
    "status" "GovernanceStatus" NOT NULL DEFAULT 'PENDING',
    "raisedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "slaDeadline" TIMESTAMP(3) NOT NULL,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "collegeId" TEXT NOT NULL,
    "raisedById" TEXT NOT NULL,
    "decidedById" TEXT,

    CONSTRAINT "governance_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "compliance_items_code_key" ON "compliance_items"("code");

-- CreateIndex
CREATE INDEX "compliance_items_collegeId_status_idx" ON "compliance_items"("collegeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "governance_requests_requestNo_key" ON "governance_requests"("requestNo");

-- CreateIndex
CREATE INDEX "governance_requests_collegeId_status_idx" ON "governance_requests"("collegeId", "status");

-- CreateIndex
CREATE INDEX "governance_requests_slaDeadline_idx" ON "governance_requests"("slaDeadline");

-- AddForeignKey
ALTER TABLE "compliance_items" ADD CONSTRAINT "compliance_items_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "colleges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_items" ADD CONSTRAINT "compliance_items_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "faculty"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "governance_requests" ADD CONSTRAINT "governance_requests_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "colleges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "governance_requests" ADD CONSTRAINT "governance_requests_raisedById_fkey" FOREIGN KEY ("raisedById") REFERENCES "faculty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "governance_requests" ADD CONSTRAINT "governance_requests_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "faculty"("id") ON DELETE SET NULL ON UPDATE CASCADE;

