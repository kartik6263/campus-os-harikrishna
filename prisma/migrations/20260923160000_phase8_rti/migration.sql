-- CreateEnum
CREATE TYPE "RtiStatus" AS ENUM ('RECEIVED', 'ASSIGNED', 'UNDER_PROCESS', 'REPLIED', 'REJECTED', 'TRANSFERRED', 'FIRST_APPEAL', 'CIC_APPEAL', 'CLOSED');

-- CreateEnum
CREATE TYPE "AppealTier" AS ENUM ('FIRST', 'CIC');

-- CreateEnum
CREATE TYPE "AppealOutcome" AS ENUM ('PENDING', 'UPHELD', 'ALLOWED', 'PARTIALLY_ALLOWED');

-- CreateTable
CREATE TABLE "rti_applications" (
    "id" TEXT NOT NULL,
    "applicationNo" TEXT NOT NULL,
    "applicantName" TEXT NOT NULL,
    "applicantAddress" TEXT,
    "applicantEmail" TEXT,
    "subject" TEXT NOT NULL,
    "particulars" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "receivedOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bplExempt" BOOLEAN NOT NULL DEFAULT false,
    "feePaid" BOOLEAN NOT NULL DEFAULT false,
    "status" "RtiStatus" NOT NULL DEFAULT 'RECEIVED',
    "pioId" TEXT,
    "assignedAt" TIMESTAMP(3),
    "repliedOn" TIMESTAMP(3),
    "replyText" TEXT,
    "pagesSupplied" INTEGER,
    "additionalFee" INTEGER,
    "rejectedOn" TIMESTAMP(3),
    "rejectionGrounds" TEXT[],
    "rejectionReason" TEXT,
    "transferredTo" TEXT,
    "transferredOn" TIMESTAMP(3),
    "collegeId" TEXT NOT NULL,

    CONSTRAINT "rti_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rti_appeals" (
    "id" TEXT NOT NULL,
    "appealNo" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "tier" "AppealTier" NOT NULL,
    "filedOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deemedRefusal" BOOLEAN NOT NULL DEFAULT false,
    "grounds" TEXT NOT NULL,
    "outcome" "AppealOutcome" NOT NULL DEFAULT 'PENDING',
    "decidedOn" TIMESTAMP(3),
    "decision" TEXT,
    "decidedById" TEXT,

    CONSTRAINT "rti_appeals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rti_applications_applicationNo_key" ON "rti_applications"("applicationNo");

-- CreateIndex
CREATE INDEX "rti_applications_collegeId_status_idx" ON "rti_applications"("collegeId", "status");

-- CreateIndex
CREATE INDEX "rti_applications_receivedOn_idx" ON "rti_applications"("receivedOn");

-- CreateIndex
CREATE UNIQUE INDEX "rti_appeals_appealNo_key" ON "rti_appeals"("appealNo");

-- CreateIndex
CREATE INDEX "rti_appeals_outcome_idx" ON "rti_appeals"("outcome");

-- CreateIndex
CREATE UNIQUE INDEX "rti_appeals_applicationId_tier_key" ON "rti_appeals"("applicationId", "tier");

-- AddForeignKey
ALTER TABLE "rti_applications" ADD CONSTRAINT "rti_applications_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "colleges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rti_applications" ADD CONSTRAINT "rti_applications_pioId_fkey" FOREIGN KEY ("pioId") REFERENCES "office_staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rti_appeals" ADD CONSTRAINT "rti_appeals_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "rti_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rti_appeals" ADD CONSTRAINT "rti_appeals_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "office_staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

