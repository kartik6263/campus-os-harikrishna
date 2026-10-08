-- CreateEnum
CREATE TYPE "TimetableChangeKind" AS ENUM ('CANCEL', 'ROOM', 'SUBSTITUTE', 'EXTRA');

-- CreateEnum
CREATE TYPE "RoomKind" AS ENUM ('CLASSROOM', 'LAB', 'HALL', 'SEMINAR', 'OTHER');

-- CreateTable
CREATE TABLE "timetable_changes" (
    "id" TEXT NOT NULL,
    "kind" "TimetableChangeKind" NOT NULL,
    "slotId" TEXT,
    "subjectId" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "room" TEXT NOT NULL,
    "facultyId" TEXT,
    "faculty" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "makeupForId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "timetable_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "building" TEXT NOT NULL DEFAULT '',
    "capacity" INTEGER NOT NULL DEFAULT 60,
    "kind" "RoomKind" NOT NULL DEFAULT 'CLASSROOM',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bell_periods" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "isBreak" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "bell_periods_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "timetable_changes_date_idx" ON "timetable_changes"("date");

-- CreateIndex
CREATE INDEX "timetable_changes_slotId_date_idx" ON "timetable_changes"("slotId", "date");

-- CreateIndex
CREATE INDEX "timetable_changes_subjectId_date_idx" ON "timetable_changes"("subjectId", "date");

-- CreateIndex
CREATE INDEX "timetable_changes_facultyId_date_idx" ON "timetable_changes"("facultyId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "rooms_code_key" ON "rooms"("code");

-- CreateIndex
CREATE UNIQUE INDEX "bell_periods_startTime_key" ON "bell_periods"("startTime");

-- AddForeignKey
ALTER TABLE "timetable_changes" ADD CONSTRAINT "timetable_changes_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "timetable_slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_changes" ADD CONSTRAINT "timetable_changes_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Every room the timetable already names becomes a room on the list; labs by name.
INSERT INTO "rooms" ("id", "code", "kind")
SELECT 'room_' || md5(r), r, CASE WHEN r ILIKE 'lab%' OR r ILIKE '%lab' THEN 'LAB'::"RoomKind" ELSE 'CLASSROOM'::"RoomKind" END
FROM (SELECT DISTINCT trim("room") AS r FROM "timetable_slots" WHERE trim("room") <> '') x
ON CONFLICT ("code") DO NOTHING;
