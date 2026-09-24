-- CreateEnum
CREATE TYPE "Role" AS ENUM ('STUDENT', 'PARENT', 'FACULTY', 'OFFICE', 'PRINCIPAL', 'REGISTRAR', 'ADMIN');

-- CreateEnum
CREATE TYPE "Weekday" AS ENUM ('MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED');

-- CreateEnum
CREATE TYPE "FeeCategory" AS ENUM ('TUITION', 'DEVELOPMENT', 'EXAM', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "ResultOutcome" AS ENUM ('PASS', 'FAIL', 'WITHHELD');

-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('ATTENDANCE', 'FEE', 'RESULT', 'EXAM', 'GENERAL');

-- CreateEnum
CREATE TYPE "AnnouncementScope" AS ENUM ('UNIVERSITY', 'COLLEGE', 'DEPARTMENT', 'BATCH');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "family" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" TEXT,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "colleges" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "district" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "colleges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "programmes" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "years" INTEGER NOT NULL DEFAULT 3,
    "collegeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "programmes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "students" (
    "id" TEXT NOT NULL,
    "enrolmentNo" TEXT NOT NULL,
    "rollNo" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameHi" TEXT,
    "dob" TIMESTAMP(3) NOT NULL,
    "gender" TEXT,
    "category" TEXT,
    "semester" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "batch" TEXT NOT NULL,
    "mobile" TEXT,
    "address" TEXT,
    "apaarId" TEXT,
    "abcId" TEXT,
    "abcCredits" INTEGER NOT NULL DEFAULT 0,
    "abcTarget" INTEGER NOT NULL DEFAULT 120,
    "digilockerLinked" BOOLEAN NOT NULL DEFAULT false,
    "validUpto" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "collegeId" TEXT NOT NULL,
    "programmeId" TEXT NOT NULL,
    "guardianId" TEXT,

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subjects" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "credits" INTEGER NOT NULL,
    "semester" INTEGER NOT NULL,
    "programmeId" TEXT NOT NULL,

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrolments" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "faculty" TEXT NOT NULL,
    "room" TEXT NOT NULL,
    "term" TEXT NOT NULL,

    CONSTRAINT "enrolments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timetable_slots" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "day" "Weekday" NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "room" TEXT NOT NULL,
    "faculty" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "cancelled" BOOLEAN NOT NULL DEFAULT false,
    "cancelReason" TEXT,
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "timetable_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_sessions" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "room" TEXT NOT NULL,
    "faculty" TEXT NOT NULL,
    "qrToken" TEXT,
    "qrExpiresAt" TIMESTAMP(3),

    CONSTRAINT "class_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_records" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "markedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_items" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "head" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "paid" INTEGER NOT NULL DEFAULT 0,
    "category" "FeeCategory" NOT NULL,
    "term" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3),

    CONSTRAINT "fee_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "head" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "mode" TEXT NOT NULL,
    "txnId" TEXT NOT NULL,
    "receiptNo" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "instalmentId" TEXT,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instalments" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "term" TEXT NOT NULL,

    CONSTRAINT "instalments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scholarship_awards" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "adjusted" BOOLEAN NOT NULL DEFAULT false,
    "adjustedAt" TIMESTAMP(3),
    "term" TEXT NOT NULL,

    CONSTRAINT "scholarship_awards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "semester_results" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "semester" INTEGER NOT NULL,
    "declaredOn" TEXT NOT NULL,
    "sgpa" DOUBLE PRECISION NOT NULL,
    "cgpa" DOUBLE PRECISION NOT NULL,
    "totalCredits" INTEGER NOT NULL,
    "outcome" "ResultOutcome" NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "semester_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subject_results" (
    "id" TEXT NOT NULL,
    "resultId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "internal" INTEGER NOT NULL,
    "external" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "grade" TEXT NOT NULL,
    "passed" BOOLEAN NOT NULL,

    CONSTRAINT "subject_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "kind" "NotificationKind" NOT NULL,
    "title" TEXT NOT NULL,
    "titleHi" TEXT,
    "body" TEXT NOT NULL,
    "bodyHi" TEXT,
    "urgent" BOOLEAN NOT NULL DEFAULT false,
    "href" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transport_routes" (
    "id" TEXT NOT NULL,
    "routeNo" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "busNo" TEXT NOT NULL,
    "driver" TEXT NOT NULL,
    "driverPhone" TEXT NOT NULL,
    "currentStop" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transport_routes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "route_stops" (
    "id" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "time" TEXT NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "route_stops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bus_passes" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "valid" BOOLEAN NOT NULL DEFAULT true,
    "validTill" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bus_passes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcements" (
    "id" TEXT NOT NULL,
    "scope" "AnnouncementScope" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "urgent" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

-- CreateIndex
CREATE INDEX "refresh_tokens_family_idx" ON "refresh_tokens"("family");

-- CreateIndex
CREATE UNIQUE INDEX "colleges_code_key" ON "colleges"("code");

-- CreateIndex
CREATE UNIQUE INDEX "programmes_code_key" ON "programmes"("code");

-- CreateIndex
CREATE UNIQUE INDEX "students_enrolmentNo_key" ON "students"("enrolmentNo");

-- CreateIndex
CREATE UNIQUE INDEX "students_rollNo_key" ON "students"("rollNo");

-- CreateIndex
CREATE UNIQUE INDEX "students_apaarId_key" ON "students"("apaarId");

-- CreateIndex
CREATE UNIQUE INDEX "students_abcId_key" ON "students"("abcId");

-- CreateIndex
CREATE UNIQUE INDEX "students_userId_key" ON "students"("userId");

-- CreateIndex
CREATE INDEX "students_collegeId_idx" ON "students"("collegeId");

-- CreateIndex
CREATE INDEX "students_programmeId_idx" ON "students"("programmeId");

-- CreateIndex
CREATE UNIQUE INDEX "subjects_code_key" ON "subjects"("code");

-- CreateIndex
CREATE INDEX "subjects_programmeId_semester_idx" ON "subjects"("programmeId", "semester");

-- CreateIndex
CREATE UNIQUE INDEX "enrolments_studentId_subjectId_term_key" ON "enrolments"("studentId", "subjectId", "term");

-- CreateIndex
CREATE INDEX "timetable_slots_subjectId_day_idx" ON "timetable_slots"("subjectId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "class_sessions_qrToken_key" ON "class_sessions"("qrToken");

-- CreateIndex
CREATE INDEX "class_sessions_subjectId_date_idx" ON "class_sessions"("subjectId", "date");

-- CreateIndex
CREATE INDEX "attendance_records_studentId_idx" ON "attendance_records"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_records_studentId_sessionId_key" ON "attendance_records"("studentId", "sessionId");

-- CreateIndex
CREATE INDEX "fee_items_studentId_term_idx" ON "fee_items"("studentId", "term");

-- CreateIndex
CREATE UNIQUE INDEX "payments_txnId_key" ON "payments"("txnId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_receiptNo_key" ON "payments"("receiptNo");

-- CreateIndex
CREATE UNIQUE INDEX "payments_instalmentId_key" ON "payments"("instalmentId");

-- CreateIndex
CREATE INDEX "payments_studentId_idx" ON "payments"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "instalments_studentId_term_number_key" ON "instalments"("studentId", "term", "number");

-- CreateIndex
CREATE INDEX "scholarship_awards_studentId_idx" ON "scholarship_awards"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "semester_results_studentId_semester_key" ON "semester_results"("studentId", "semester");

-- CreateIndex
CREATE UNIQUE INDEX "subject_results_resultId_subjectId_key" ON "subject_results"("resultId", "subjectId");

-- CreateIndex
CREATE INDEX "notifications_studentId_readAt_idx" ON "notifications"("studentId", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "transport_routes_routeNo_key" ON "transport_routes"("routeNo");

-- CreateIndex
CREATE UNIQUE INDEX "route_stops_routeId_order_key" ON "route_stops"("routeId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "bus_passes_studentId_key" ON "bus_passes"("studentId");

-- CreateIndex
CREATE INDEX "announcements_scope_publishedAt_idx" ON "announcements"("scope", "publishedAt");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "programmes" ADD CONSTRAINT "programmes_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "colleges"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "colleges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "programmes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "programmes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrolments" ADD CONSTRAINT "enrolments_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrolments" ADD CONSTRAINT "enrolments_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "class_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_items" ADD CONSTRAINT "fee_items_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_instalmentId_fkey" FOREIGN KEY ("instalmentId") REFERENCES "instalments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instalments" ADD CONSTRAINT "instalments_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scholarship_awards" ADD CONSTRAINT "scholarship_awards_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "semester_results" ADD CONSTRAINT "semester_results_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_results" ADD CONSTRAINT "subject_results_resultId_fkey" FOREIGN KEY ("resultId") REFERENCES "semester_results"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_results" ADD CONSTRAINT "subject_results_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_stops" ADD CONSTRAINT "route_stops_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "transport_routes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bus_passes" ADD CONSTRAINT "bus_passes_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bus_passes" ADD CONSTRAINT "bus_passes_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "transport_routes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
