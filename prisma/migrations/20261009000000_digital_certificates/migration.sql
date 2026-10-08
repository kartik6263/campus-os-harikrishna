-- CreateEnum
CREATE TYPE "DigitalCertificateStatus" AS ENUM ('VALID', 'REVOKED');

-- CreateTable
CREATE TABLE "certificate_signing_keys" (
    "id" TEXT NOT NULL,
    "algorithm" TEXT NOT NULL DEFAULT 'Ed25519',
    "publicKey" TEXT NOT NULL,
    "privateKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retiredAt" TIMESTAMP(3),

    CONSTRAINT "certificate_signing_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "digital_certificates" (
    "id" TEXT NOT NULL,
    "serialNo" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "recipientName" TEXT NOT NULL,
    "recipientRef" TEXT,
    "recipientEmail" TEXT,
    "fields" JSONB NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3),
    "issuerName" TEXT NOT NULL,
    "issuerTitle" TEXT NOT NULL,
    "institutionName" TEXT NOT NULL,
    "institutionCode" TEXT NOT NULL,
    "issuedById" TEXT,
    "payloadHash" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "keyId" TEXT NOT NULL,
    "fileId" TEXT,
    "pdfHash" TEXT,
    "status" "DigitalCertificateStatus" NOT NULL DEFAULT 'VALID',
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    "revokedBy" TEXT,
    "batchRef" TEXT,
    "verifications" INTEGER NOT NULL DEFAULT 0,
    "lastVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "studentId" TEXT,
    "requestId" TEXT,

    CONSTRAINT "digital_certificates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "digital_certificates_serialNo_key" ON "digital_certificates"("serialNo");

-- CreateIndex
CREATE UNIQUE INDEX "digital_certificates_fileId_key" ON "digital_certificates"("fileId");

-- CreateIndex
CREATE UNIQUE INDEX "digital_certificates_pdfHash_key" ON "digital_certificates"("pdfHash");

-- CreateIndex
CREATE UNIQUE INDEX "digital_certificates_requestId_key" ON "digital_certificates"("requestId");

-- CreateIndex
CREATE INDEX "digital_certificates_studentId_idx" ON "digital_certificates"("studentId");

-- CreateIndex
CREATE INDEX "digital_certificates_type_issuedAt_idx" ON "digital_certificates"("type", "issuedAt");

-- CreateIndex
CREATE INDEX "digital_certificates_batchRef_idx" ON "digital_certificates"("batchRef");

-- AddForeignKey
ALTER TABLE "digital_certificates" ADD CONSTRAINT "digital_certificates_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "digital_certificates" ADD CONSTRAINT "digital_certificates_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "certificate_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "digital_certificates" ADD CONSTRAINT "digital_certificates_keyId_fkey" FOREIGN KEY ("keyId") REFERENCES "certificate_signing_keys"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

