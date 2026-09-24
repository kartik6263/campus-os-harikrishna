-- CreateEnum
CREATE TYPE "VendorStatus" AS ENUM ('PENDING', 'EMPANELLED', 'BLACKLISTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "TenderStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CORRIGENDUM', 'BID_OPEN', 'EVALUATION', 'AWARDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BidStatus" AS ENUM ('SUBMITTED', 'TECHNICAL_QUALIFIED', 'TECHNICAL_REJECTED', 'FINANCIAL_OPENED', 'RECOMMENDED');

-- CreateEnum
CREATE TYPE "POStatus" AS ENUM ('ISSUED', 'ACKNOWLEDGED', 'PARTIAL_DELIVERY', 'DELIVERED', 'INSPECTED', 'BILL_PASSED', 'PAID');

-- CreateTable
CREATE TABLE "vendors" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gstin" TEXT NOT NULL,
    "pan" TEXT NOT NULL,
    "categories" TEXT[],
    "contactName" TEXT NOT NULL,
    "contactMobile" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" "VendorStatus" NOT NULL DEFAULT 'PENDING',
    "documentsVerified" BOOLEAN NOT NULL DEFAULT false,
    "registeredOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "empanelledUpto" TIMESTAMP(3),
    "statusReason" TEXT,
    "collegeId" TEXT NOT NULL,

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenders" (
    "id" TEXT NOT NULL,
    "refNo" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "estimatedValue" INTEGER NOT NULL,
    "status" "TenderStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedOn" TIMESTAMP(3),
    "submissionDeadline" TIMESTAMP(3) NOT NULL,
    "openingDate" TIMESTAMP(3) NOT NULL,
    "technicalClosedAt" TIMESTAMP(3),
    "awardedBidId" TEXT,
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "collegeId" TEXT NOT NULL,
    "requestId" TEXT,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "tenders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tender_corrigenda" (
    "id" TEXT NOT NULL,
    "tenderId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "newDeadline" TIMESTAMP(3),
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tender_corrigenda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tender_bids" (
    "id" TEXT NOT NULL,
    "tenderId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "technicalScore" INTEGER,
    "technicalRemarks" TEXT,
    "financialQuote" INTEGER NOT NULL,
    "financialOpenedAt" TIMESTAMP(3),
    "status" "BidStatus" NOT NULL DEFAULT 'SUBMITTED',

    CONSTRAINT "tender_bids_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" TEXT NOT NULL,
    "poNo" TEXT NOT NULL,
    "tenderId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "totalAmount" INTEGER NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveryDeadline" TIMESTAMP(3) NOT NULL,
    "status" "POStatus" NOT NULL DEFAULT 'ISSUED',
    "grnNo" TEXT,
    "invoiceNo" TEXT,
    "billPassedOn" TIMESTAMP(3),
    "paymentDate" TIMESTAMP(3),
    "paymentRef" TEXT,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "po_items" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitRate" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "deliveredQty" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "po_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vendors_code_key" ON "vendors"("code");

-- CreateIndex
CREATE UNIQUE INDEX "vendors_gstin_key" ON "vendors"("gstin");

-- CreateIndex
CREATE INDEX "vendors_collegeId_status_idx" ON "vendors"("collegeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "tenders_refNo_key" ON "tenders"("refNo");

-- CreateIndex
CREATE UNIQUE INDEX "tenders_awardedBidId_key" ON "tenders"("awardedBidId");

-- CreateIndex
CREATE INDEX "tenders_collegeId_status_idx" ON "tenders"("collegeId", "status");

-- CreateIndex
CREATE INDEX "tender_bids_tenderId_status_idx" ON "tender_bids"("tenderId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "tender_bids_tenderId_vendorId_key" ON "tender_bids"("tenderId", "vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_poNo_key" ON "purchase_orders"("poNo");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_tenderId_key" ON "purchase_orders"("tenderId");

-- CreateIndex
CREATE INDEX "purchase_orders_status_idx" ON "purchase_orders"("status");

-- AddForeignKey
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "colleges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenders" ADD CONSTRAINT "tenders_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "colleges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenders" ADD CONSTRAINT "tenders_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "governance_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenders" ADD CONSTRAINT "tenders_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "faculty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tender_corrigenda" ADD CONSTRAINT "tender_corrigenda_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "tenders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tender_bids" ADD CONSTRAINT "tender_bids_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "tenders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tender_bids" ADD CONSTRAINT "tender_bids_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "tenders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "po_items" ADD CONSTRAINT "po_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

