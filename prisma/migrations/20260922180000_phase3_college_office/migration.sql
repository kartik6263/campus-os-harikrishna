-- CreateEnum
CREATE TYPE "AdmissionStatus" AS ENUM ('PENDING_DOCS', 'VERIFIED', 'ENROLLED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ReceiptStatus" AS ENUM ('COMPLETE', 'PENDING_CLEARANCE', 'BOUNCED');

-- CreateEnum
CREATE TYPE "CertificateStage" AS ENUM ('REQUESTED', 'COLLEGE_OFFICE', 'READY', 'DISPATCHED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CertificatePriority" AS ENUM ('NORMAL', 'URGENT');

-- CreateEnum
CREATE TYPE "ExamFormEligibility" AS ENUM ('PENDING', 'ELIGIBLE', 'SHORTAGE', 'FEE_DUE', 'CLEARED');

-- CreateEnum
CREATE TYPE "ExamSubjectKind" AS ENUM ('REGULAR', 'BACKLOG');

-- CreateTable
CREATE TABLE "office_staff" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameHi" TEXT,
    "designation" TEXT NOT NULL,
    "counter" TEXT,
    "mobile" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "collegeId" TEXT NOT NULL,

    CONSTRAINT "office_staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admission_applications" (
    "id" TEXT NOT NULL,
    "applicationNo" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameHi" TEXT,
    "dob" TIMESTAMP(3) NOT NULL,
    "gender" TEXT,
    "category" TEXT,
    "mobile" TEXT,
    "email" TEXT,
    "meritRank" INTEGER,
    "admissionDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "AdmissionStatus" NOT NULL DEFAULT 'PENDING_DOCS',
    "rejectReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "collegeId" TEXT NOT NULL,
    "programmeId" TEXT NOT NULL,
    "studentId" TEXT,

    CONSTRAINT "admission_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admission_documents" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "uploaded" BOOLEAN NOT NULL DEFAULT false,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "remarks" TEXT,

    CONSTRAINT "admission_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "counter_receipts" (
    "id" TEXT NOT NULL,
    "receiptNo" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "head" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "mode" TEXT NOT NULL,
    "instrument" TEXT,
    "status" "ReceiptStatus" NOT NULL DEFAULT 'COMPLETE',
    "settledAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "remarks" TEXT,
    "receivedById" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,

    CONSTRAINT "counter_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certificate_requests" (
    "id" TEXT NOT NULL,
    "requestNo" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "priority" "CertificatePriority" NOT NULL DEFAULT 'NORMAL',
    "stage" "CertificateStage" NOT NULL DEFAULT 'REQUESTED',
    "fee" INTEGER NOT NULL DEFAULT 0,
    "feePaid" BOOLEAN NOT NULL DEFAULT false,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "slaDeadline" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "issuedById" TEXT,
    "issuedAt" TIMESTAMP(3),
    "rejectReason" TEXT,

    CONSTRAINT "certificate_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_forms" (
    "id" TEXT NOT NULL,
    "formNo" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "semester" INTEGER NOT NULL,
    "term" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eligibility" "ExamFormEligibility" NOT NULL DEFAULT 'PENDING',
    "remarks" TEXT,
    "scrutinisedById" TEXT,
    "scrutinisedAt" TIMESTAMP(3),

    CONSTRAINT "exam_forms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_form_subjects" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "kind" "ExamSubjectKind" NOT NULL DEFAULT 'REGULAR',

    CONSTRAINT "exam_form_subjects_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "office_staff_employeeId_key" ON "office_staff"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "office_staff_userId_key" ON "office_staff"("userId");

-- CreateIndex
CREATE INDEX "office_staff_collegeId_idx" ON "office_staff"("collegeId");

-- CreateIndex
CREATE UNIQUE INDEX "admission_applications_applicationNo_key" ON "admission_applications"("applicationNo");

-- CreateIndex
CREATE UNIQUE INDEX "admission_applications_studentId_key" ON "admission_applications"("studentId");

-- CreateIndex
CREATE INDEX "admission_applications_collegeId_status_idx" ON "admission_applications"("collegeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "admission_documents_applicationId_name_key" ON "admission_documents"("applicationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "counter_receipts_receiptNo_key" ON "counter_receipts"("receiptNo");

-- CreateIndex
CREATE UNIQUE INDEX "counter_receipts_paymentId_key" ON "counter_receipts"("paymentId");

-- CreateIndex
CREATE INDEX "counter_receipts_studentId_idx" ON "counter_receipts"("studentId");

-- CreateIndex
CREATE INDEX "counter_receipts_receivedAt_idx" ON "counter_receipts"("receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "certificate_requests_requestNo_key" ON "certificate_requests"("requestNo");

-- CreateIndex
CREATE INDEX "certificate_requests_stage_slaDeadline_idx" ON "certificate_requests"("stage", "slaDeadline");

-- CreateIndex
CREATE INDEX "certificate_requests_studentId_idx" ON "certificate_requests"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "exam_forms_formNo_key" ON "exam_forms"("formNo");

-- CreateIndex
CREATE INDEX "exam_forms_eligibility_idx" ON "exam_forms"("eligibility");

-- CreateIndex
CREATE UNIQUE INDEX "exam_forms_studentId_semester_term_key" ON "exam_forms"("studentId", "semester", "term");

-- CreateIndex
CREATE UNIQUE INDEX "exam_form_subjects_formId_subjectId_key" ON "exam_form_subjects"("formId", "subjectId");

-- AddForeignKey
ALTER TABLE "office_staff" ADD CONSTRAINT "office_staff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "office_staff" ADD CONSTRAINT "office_staff_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "colleges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_applications" ADD CONSTRAINT "admission_applications_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "colleges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_applications" ADD CONSTRAINT "admission_applications_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "programmes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_applications" ADD CONSTRAINT "admission_applications_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_documents" ADD CONSTRAINT "admission_documents_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "admission_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_documents" ADD CONSTRAINT "admission_documents_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "office_staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counter_receipts" ADD CONSTRAINT "counter_receipts_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counter_receipts" ADD CONSTRAINT "counter_receipts_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "office_staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counter_receipts" ADD CONSTRAINT "counter_receipts_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificate_requests" ADD CONSTRAINT "certificate_requests_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificate_requests" ADD CONSTRAINT "certificate_requests_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "office_staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_forms" ADD CONSTRAINT "exam_forms_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_forms" ADD CONSTRAINT "exam_forms_scrutinisedById_fkey" FOREIGN KEY ("scrutinisedById") REFERENCES "office_staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_form_subjects" ADD CONSTRAINT "exam_form_subjects_formId_fkey" FOREIGN KEY ("formId") REFERENCES "exam_forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_form_subjects" ADD CONSTRAINT "exam_form_subjects_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

