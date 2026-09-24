-- CreateEnum
CREATE TYPE "PermissionEffect" AS ENUM ('ALLOW', 'DENY');

-- CreateEnum
CREATE TYPE "AuditOutcome" AS ENUM ('OK', 'WARN', 'DENIED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "failedAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lockReason" TEXT,
ADD COLUMN     "lockedAt" TIMESTAMP(3),
ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "permission_rules" (
    "id" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "module" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "effect" "PermissionEffect" NOT NULL DEFAULT 'ALLOW',
    "note" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "permission_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_entries" (
    "id" TEXT NOT NULL,
    "seq" SERIAL NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT,
    "actorName" TEXT NOT NULL,
    "actorRole" TEXT,
    "module" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "detail" TEXT,
    "ip" TEXT,
    "outcome" "AuditOutcome" NOT NULL DEFAULT 'OK',
    "hash" TEXT NOT NULL,
    "prevHash" TEXT NOT NULL,

    CONSTRAINT "audit_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "permission_rules_role_idx" ON "permission_rules"("role");

-- CreateIndex
CREATE UNIQUE INDEX "permission_rules_role_module_action_key" ON "permission_rules"("role", "module", "action");

-- CreateIndex
CREATE UNIQUE INDEX "audit_entries_seq_key" ON "audit_entries"("seq");

-- CreateIndex
CREATE UNIQUE INDEX "audit_entries_hash_key" ON "audit_entries"("hash");

-- CreateIndex
CREATE INDEX "audit_entries_module_occurredAt_idx" ON "audit_entries"("module", "occurredAt");

-- CreateIndex
CREATE INDEX "audit_entries_actorId_idx" ON "audit_entries"("actorId");

-- AddForeignKey
ALTER TABLE "audit_entries" ADD CONSTRAINT "audit_entries_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

