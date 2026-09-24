-- CreateEnum
CREATE TYPE "SubjectKind" AS ENUM ('THEORY', 'LAB', 'PROJECT');

-- CreateEnum
CREATE TYPE "CorrectionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "MarksSheetStatus" AS ENUM ('NOT_STARTED', 'DRAFT', 'SUBMITTED', 'APPROVED', 'RETURNED');

-- CreateEnum
CREATE TYPE "LeaveStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LeaveKind" AS ENUM ('CASUAL', 'MEDICAL', 'EARNED', 'DUTY', 'MATERNITY', 'UNPAID');

-- CreateEnum
CREATE TYPE "MaterialType" AS ENUM ('PDF', 'PPT', 'VIDEO', 'LINK');

-- AlterTable
ALTER TABLE "class_sessions" ADD COLUMN     "facultyId" TEXT,
ADD COLUMN     "markedAt" TIMESTAMP(3),
ADD COLUMN     "markedById" TEXT;

-- AlterTable
ALTER TABLE "enrolments" ADD COLUMN     "facultyId" TEXT;

-- AlterTable
ALTER TABLE "timetable_slots" ADD COLUMN     "facultyId" TEXT;

-- CreateTable
CREATE TABLE "faculty" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "teacherCode" TEXT,
    "name" TEXT NOT NULL,
    "nameHi" TEXT,
    "designation" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "mobile" TEXT,
    "joinDate" TIMESTAMP(3) NOT NULL,
    "specialization" TEXT,
    "maxWeeklyLoad" INTEGER NOT NULL DEFAULT 18,
    "isHod" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "collegeId" TEXT NOT NULL,

    CONSTRAINT "faculty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subject_assignments" (
    "id" TEXT NOT NULL,
    "facultyId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "section" TEXT NOT NULL DEFAULT 'A',
    "classLabel" TEXT NOT NULL,
    "room" TEXT NOT NULL,
    "kind" "SubjectKind" NOT NULL DEFAULT 'THEORY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subject_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_corrections" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "markedAs" "AttendanceStatus" NOT NULL,
    "requestedStatus" "AttendanceStatus" NOT NULL,
    "reason" TEXT NOT NULL,
    "attachment" TEXT,
    "status" "CorrectionStatus" NOT NULL DEFAULT 'PENDING',
    "raisedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "decisionNote" TEXT,

    CONSTRAINT "attendance_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marks_components" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "maxMarks" INTEGER NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "marks_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marks_sheets" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "status" "MarksSheetStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "submittedAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "returnReason" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marks_sheets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mark_entries" (
    "id" TEXT NOT NULL,
    "sheetId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "value" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mark_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mentorships" (
    "id" TEXT NOT NULL,
    "facultyId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastInteractionAt" TIMESTAMP(3),

    CONSTRAINT "mentorships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mentor_notes" (
    "id" TEXT NOT NULL,
    "mentorshipId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mentor_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faculty_leaves" (
    "id" TEXT NOT NULL,
    "facultyId" TEXT NOT NULL,
    "kind" "LeaveKind" NOT NULL,
    "fromDate" TIMESTAMP(3) NOT NULL,
    "toDate" TIMESTAMP(3) NOT NULL,
    "days" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "substitute" TEXT,
    "status" "LeaveStatus" NOT NULL DEFAULT 'PENDING',
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "decisionNote" TEXT,

    CONSTRAINT "faculty_leaves_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_materials" (
    "id" TEXT NOT NULL,
    "facultyId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "unit" INTEGER NOT NULL,
    "unitTitle" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "url" TEXT,
    "type" "MaterialType" NOT NULL,
    "sizeLabel" TEXT,
    "visibleToStudents" BOOLEAN NOT NULL DEFAULT true,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "study_materials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "faculty_employeeId_key" ON "faculty"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "faculty_teacherCode_key" ON "faculty"("teacherCode");

-- CreateIndex
CREATE UNIQUE INDEX "faculty_userId_key" ON "faculty"("userId");

-- CreateIndex
CREATE INDEX "faculty_collegeId_department_idx" ON "faculty"("collegeId", "department");

-- CreateIndex
CREATE INDEX "subject_assignments_subjectId_term_idx" ON "subject_assignments"("subjectId", "term");

-- CreateIndex
CREATE UNIQUE INDEX "subject_assignments_facultyId_subjectId_term_section_key" ON "subject_assignments"("facultyId", "subjectId", "term", "section");

-- CreateIndex
CREATE INDEX "attendance_corrections_status_raisedAt_idx" ON "attendance_corrections"("status", "raisedAt");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_corrections_studentId_sessionId_key" ON "attendance_corrections"("studentId", "sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "marks_components_assignmentId_key_key" ON "marks_components"("assignmentId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "marks_sheets_assignmentId_key" ON "marks_sheets"("assignmentId");

-- CreateIndex
CREATE INDEX "mark_entries_sheetId_studentId_idx" ON "mark_entries"("sheetId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "mark_entries_sheetId_studentId_componentId_key" ON "mark_entries"("sheetId", "studentId", "componentId");

-- CreateIndex
CREATE UNIQUE INDEX "mentorships_facultyId_studentId_key" ON "mentorships"("facultyId", "studentId");

-- CreateIndex
CREATE INDEX "mentor_notes_mentorshipId_createdAt_idx" ON "mentor_notes"("mentorshipId", "createdAt");

-- CreateIndex
CREATE INDEX "faculty_leaves_facultyId_appliedAt_idx" ON "faculty_leaves"("facultyId", "appliedAt");

-- CreateIndex
CREATE INDEX "faculty_leaves_status_idx" ON "faculty_leaves"("status");

-- CreateIndex
CREATE INDEX "study_materials_subjectId_unit_idx" ON "study_materials"("subjectId", "unit");

-- CreateIndex
CREATE INDEX "study_materials_facultyId_idx" ON "study_materials"("facultyId");

-- CreateIndex
CREATE INDEX "class_sessions_facultyId_date_idx" ON "class_sessions"("facultyId", "date");

-- CreateIndex
CREATE INDEX "timetable_slots_facultyId_day_idx" ON "timetable_slots"("facultyId", "day");

-- AddForeignKey
ALTER TABLE "enrolments" ADD CONSTRAINT "enrolments_facultyId_fkey" FOREIGN KEY ("facultyId") REFERENCES "faculty"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_facultyId_fkey" FOREIGN KEY ("facultyId") REFERENCES "faculty"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_facultyId_fkey" FOREIGN KEY ("facultyId") REFERENCES "faculty"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_markedById_fkey" FOREIGN KEY ("markedById") REFERENCES "faculty"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faculty" ADD CONSTRAINT "faculty_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faculty" ADD CONSTRAINT "faculty_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "colleges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_assignments" ADD CONSTRAINT "subject_assignments_facultyId_fkey" FOREIGN KEY ("facultyId") REFERENCES "faculty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_assignments" ADD CONSTRAINT "subject_assignments_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "class_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "faculty"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marks_components" ADD CONSTRAINT "marks_components_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "subject_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marks_sheets" ADD CONSTRAINT "marks_sheets_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "subject_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marks_sheets" ADD CONSTRAINT "marks_sheets_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "faculty"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mark_entries" ADD CONSTRAINT "mark_entries_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "marks_sheets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mark_entries" ADD CONSTRAINT "mark_entries_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mark_entries" ADD CONSTRAINT "mark_entries_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "marks_components"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentorships" ADD CONSTRAINT "mentorships_facultyId_fkey" FOREIGN KEY ("facultyId") REFERENCES "faculty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentorships" ADD CONSTRAINT "mentorships_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentor_notes" ADD CONSTRAINT "mentor_notes_mentorshipId_fkey" FOREIGN KEY ("mentorshipId") REFERENCES "mentorships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentor_notes" ADD CONSTRAINT "mentor_notes_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "faculty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faculty_leaves" ADD CONSTRAINT "faculty_leaves_facultyId_fkey" FOREIGN KEY ("facultyId") REFERENCES "faculty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faculty_leaves" ADD CONSTRAINT "faculty_leaves_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "faculty"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_materials" ADD CONSTRAINT "study_materials_facultyId_fkey" FOREIGN KEY ("facultyId") REFERENCES "faculty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_materials" ADD CONSTRAINT "study_materials_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
