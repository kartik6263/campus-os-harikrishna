-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'VENDOR';

-- AlterTable
ALTER TABLE "vendors" ADD COLUMN     "userId" TEXT;

-- AlterTable
ALTER TABLE "tender_bids" ADD COLUMN     "technicalProposal" TEXT;

-- AlterTable
ALTER TABLE "purchase_orders" ADD COLUMN     "acknowledgedAt" TIMESTAMP(3),
ADD COLUMN     "invoiceAmount" INTEGER,
ADD COLUMN     "invoiceDate" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "vendors_userId_key" ON "vendors"("userId");

-- AddForeignKey
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

