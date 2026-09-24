-- CreateEnum
CREATE TYPE "RiskBand" AS ENUM ('LOW', 'MODERATE', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "InterventionKind" AS ENUM ('COUNSELLING', 'PARENT_CONTACT', 'REMEDIAL_CLASS', 'FEE_RELIEF', 'MEDICAL_REFERRAL', 'OTHER');

-- CreateEnum
CREATE TYPE "InterventionOutcome" AS ENUM ('OPEN', 'IMPROVED', 'NO_CHANGE', 'WORSENED', 'WITHDRAWN');

-- CreateTable
CREATE TABLE "risk_assessments" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "assessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "score" INTEGER NOT NULL,
    "band" "RiskBand" NOT NULL,
    "basis" TEXT NOT NULL,
    "dataPoints" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "risk_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_factor_snapshots" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "factor" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "contribution" INTEGER NOT NULL,

    CONSTRAINT "risk_factor_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interventions" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "raisedById" TEXT NOT NULL,
    "kind" "InterventionKind" NOT NULL,
    "note" TEXT NOT NULL,
    "dueOn" TIMESTAMP(3),
    "outcome" "InterventionOutcome" NOT NULL DEFAULT 'OPEN',
    "outcomeNote" TEXT,
    "raisedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "scoreAtRaise" INTEGER,

    CONSTRAINT "interventions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "risk_assessments_studentId_assessedAt_idx" ON "risk_assessments"("studentId", "assessedAt");

-- CreateIndex
CREATE INDEX "risk_assessments_band_idx" ON "risk_assessments"("band");

-- CreateIndex
CREATE INDEX "interventions_studentId_raisedAt_idx" ON "interventions"("studentId", "raisedAt");

-- CreateIndex
CREATE INDEX "interventions_outcome_idx" ON "interventions"("outcome");

-- AddForeignKey
ALTER TABLE "risk_assessments" ADD CONSTRAINT "risk_assessments_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_factor_snapshots" ADD CONSTRAINT "risk_factor_snapshots_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "risk_assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interventions" ADD CONSTRAINT "interventions_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interventions" ADD CONSTRAINT "interventions_raisedById_fkey" FOREIGN KEY ("raisedById") REFERENCES "faculty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

