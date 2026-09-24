-- CreateEnum
CREATE TYPE "MetricSource" AS ENUM ('DERIVED', 'ENTERED', 'UNAVAILABLE');

-- CreateTable
CREATE TABLE "accreditation_frameworks" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "maxScore" DOUBLE PRECISION,

    CONSTRAINT "accreditation_frameworks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accreditation_metrics" (
    "id" TEXT NOT NULL,
    "frameworkId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "criterion" INTEGER,
    "criterionTitle" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "target" TEXT,
    "maxScore" DOUBLE PRECISION,
    "source" "MetricSource" NOT NULL DEFAULT 'UNAVAILABLE',
    "derivedFrom" TEXT,
    "enteredValue" TEXT,
    "enteredScore" DOUBLE PRECISION,
    "evidence" TEXT,
    "remarks" TEXT,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accreditation_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "statutory_returns" (
    "id" TEXT NOT NULL,
    "frameworkId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dueOn" TIMESTAMP(3) NOT NULL,
    "submittedOn" TIMESTAMP(3),
    "reference" TEXT,
    "remarks" TEXT,
    "collegeId" TEXT NOT NULL,

    CONSTRAINT "statutory_returns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "accreditation_frameworks_code_key" ON "accreditation_frameworks"("code");

-- CreateIndex
CREATE INDEX "accreditation_metrics_frameworkId_criterion_idx" ON "accreditation_metrics"("frameworkId", "criterion");

-- CreateIndex
CREATE UNIQUE INDEX "accreditation_metrics_frameworkId_code_key" ON "accreditation_metrics"("frameworkId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "statutory_returns_code_key" ON "statutory_returns"("code");

-- CreateIndex
CREATE INDEX "statutory_returns_collegeId_dueOn_idx" ON "statutory_returns"("collegeId", "dueOn");

-- AddForeignKey
ALTER TABLE "accreditation_metrics" ADD CONSTRAINT "accreditation_metrics_frameworkId_fkey" FOREIGN KEY ("frameworkId") REFERENCES "accreditation_frameworks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accreditation_metrics" ADD CONSTRAINT "accreditation_metrics_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "faculty"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "statutory_returns" ADD CONSTRAINT "statutory_returns_frameworkId_fkey" FOREIGN KEY ("frameworkId") REFERENCES "accreditation_frameworks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "statutory_returns" ADD CONSTRAINT "statutory_returns_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "colleges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

