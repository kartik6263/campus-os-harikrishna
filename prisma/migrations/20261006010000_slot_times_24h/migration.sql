-- Class times were seeded on a 12-hour clock without AM/PM ("01:00" for 1 pm),
-- which reads as before dawn and makes durations negative. Subject allocation
-- compares times for clashes and teaching load, so they move to the 24-hour
-- clock. No college meets between 01:00 and 06:59, so only those hours move.

UPDATE "timetable_slots"
SET "startTime" = lpad((split_part("startTime", ':', 1)::int + 12)::text, 2, '0') || ':' || split_part("startTime", ':', 2)
WHERE "startTime" ~ '^0[1-6]:[0-5][0-9]$';

UPDATE "timetable_slots"
SET "endTime" = lpad((split_part("endTime", ':', 1)::int + 12)::text, 2, '0') || ':' || split_part("endTime", ':', 2)
WHERE "endTime" ~ '^0[1-6]:[0-5][0-9]$';

UPDATE "class_sessions"
SET "startTime" = lpad((split_part("startTime", ':', 1)::int + 12)::text, 2, '0') || ':' || split_part("startTime", ':', 2)
WHERE "startTime" ~ '^0[1-6]:[0-5][0-9]$';

UPDATE "class_sessions"
SET "endTime" = lpad((split_part("endTime", ':', 1)::int + 12)::text, 2, '0') || ':' || split_part("endTime", ':', 2)
WHERE "endTime" ~ '^0[1-6]:[0-5][0-9]$';
