-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('UNVERIFIED', 'PENDING_REVIEW', 'VERIFIED', 'REJECTED');

-- CreateTable
CREATE TABLE "identity_verifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "digilockerId" TEXT,
    "dlName" TEXT,
    "dlDob" TEXT,
    "dlGender" TEXT,
    "eaadhaar" BOOLEAN NOT NULL DEFAULT false,
    "aadhaarLast4" TEXT,
    "nameMatch" BOOLEAN,
    "dobMatch" BOOLEAN,
    "identityStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "identitySource" TEXT,
    "identityDocType" TEXT,
    "identityProofFileId" TEXT,
    "identityNote" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "documents" JSONB,
    "abcId" TEXT,
    "abcSource" TEXT,
    "abcStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "abcNote" TEXT,
    "abcProofFileId" TEXT,
    "abcVerifiedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "identity_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "digilocker_sessions" (
    "id" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "codeVerifier" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "digilocker_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "identity_verifications_userId_key" ON "identity_verifications"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "identity_verifications_digilockerId_key" ON "identity_verifications"("digilockerId");

-- CreateIndex
CREATE INDEX "identity_verifications_identityStatus_idx" ON "identity_verifications"("identityStatus");

-- CreateIndex
CREATE INDEX "identity_verifications_abcStatus_idx" ON "identity_verifications"("abcStatus");

-- CreateIndex
CREATE UNIQUE INDEX "digilocker_sessions_state_key" ON "digilocker_sessions"("state");

-- CreateIndex
CREATE INDEX "digilocker_sessions_userId_idx" ON "digilocker_sessions"("userId");

-- AddForeignKey
ALTER TABLE "identity_verifications" ADD CONSTRAINT "identity_verifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
