-- CreateIndex
CREATE UNIQUE INDEX "class_sessions_subjectId_date_startTime_key" ON "class_sessions"("subjectId", "date", "startTime");

