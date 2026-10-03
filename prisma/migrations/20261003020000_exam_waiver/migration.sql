-- AlterEnum
ALTER TYPE "GovernanceKind" ADD VALUE 'EXAM_WAIVER';

-- DropForeignKey
ALTER TABLE "governance_requests" DROP CONSTRAINT "governance_requests_raisedById_fkey";

-- AlterTable
ALTER TABLE "governance_requests" ADD COLUMN     "examFormId" TEXT,
ADD COLUMN     "raisedByStaffId" TEXT,
ALTER COLUMN "raisedById" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "governance_requests_examFormId_key" ON "governance_requests"("examFormId");

-- AddForeignKey
ALTER TABLE "governance_requests" ADD CONSTRAINT "governance_requests_raisedById_fkey" FOREIGN KEY ("raisedById") REFERENCES "faculty"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "governance_requests" ADD CONSTRAINT "governance_requests_raisedByStaffId_fkey" FOREIGN KEY ("raisedByStaffId") REFERENCES "office_staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "governance_requests" ADD CONSTRAINT "governance_requests_examFormId_fkey" FOREIGN KEY ("examFormId") REFERENCES "exam_forms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
