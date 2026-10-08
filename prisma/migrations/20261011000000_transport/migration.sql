-- CreateEnum
CREATE TYPE "BusPassStatus" AS ENUM ('PENDING_PAYMENT', 'ACTIVE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "VehicleStatus" AS ENUM ('ACTIVE', 'MAINTENANCE', 'RETIRED');

-- CreateEnum
CREATE TYPE "CrewRole" AS ENUM ('DRIVER', 'ATTENDANT');

-- CreateEnum
CREATE TYPE "TransportRequestKind" AS ENUM ('NEW', 'CHANGE');

-- CreateEnum
CREATE TYPE "TransportRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TripStatus" AS ENUM ('RUNNING', 'COMPLETED', 'CANCELLED');

-- AlterTable
ALTER TABLE "transport_routes" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "attendantId" TEXT,
ADD COLUMN     "driverId" TEXT,
ADD COLUMN     "vehicleId" TEXT;

-- AlterTable
ALTER TABLE "route_stops" ADD COLUMN     "fare" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "bus_passes" ADD COLUMN     "cancelledReason" TEXT,
ADD COLUMN     "fee" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "feeHead" TEXT,
ADD COLUMN     "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "issuedBy" TEXT,
ADD COLUMN     "passNo" TEXT,
ADD COLUMN     "status" "BusPassStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
ADD COLUMN     "stopId" TEXT,
ADD COLUMN     "term" TEXT,
ALTER COLUMN "valid" SET DEFAULT false;

-- CreateTable
CREATE TABLE "vehicles" (
    "id" TEXT NOT NULL,
    "regNo" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'BUS',
    "make" TEXT,
    "capacity" INTEGER NOT NULL,
    "ownership" TEXT NOT NULL DEFAULT 'OWNED',
    "operator" TEXT,
    "fitnessValidTill" TIMESTAMP(3),
    "insuranceValidTill" TIMESTAMP(3),
    "permitValidTill" TIMESTAMP(3),
    "pucValidTill" TIMESTAMP(3),
    "gpsDeviceId" TEXT,
    "odometer" INTEGER NOT NULL DEFAULT 0,
    "status" "VehicleStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transport_crew" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "role" "CrewRole" NOT NULL,
    "licenceNo" TEXT,
    "licenceValidTill" TIMESTAMP(3),
    "verifiedOn" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transport_crew_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transport_requests" (
    "id" TEXT NOT NULL,
    "requestNo" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "stopId" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "kind" "TransportRequestKind" NOT NULL DEFAULT 'NEW',
    "note" TEXT,
    "status" "TransportRequestStatus" NOT NULL DEFAULT 'PENDING',
    "decisionNote" TEXT,
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transport_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transport_trips" (
    "id" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "shift" TEXT NOT NULL,
    "vehicleId" TEXT,
    "driverId" TEXT,
    "status" "TripStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "odometerStart" INTEGER,
    "odometerEnd" INTEGER,
    "lastStop" INTEGER NOT NULL DEFAULT -1,
    "startedBy" TEXT NOT NULL,
    "note" TEXT,

    CONSTRAINT "transport_trips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_stop_events" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "stopOrder" INTEGER NOT NULL,
    "stopName" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delayMinutes" INTEGER,

    CONSTRAINT "trip_stop_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_boardings" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "passId" TEXT NOT NULL,
    "boardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "by" TEXT NOT NULL,

    CONSTRAINT "trip_boardings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transport_incidents" (
    "id" TEXT NOT NULL,
    "incidentNo" TEXT NOT NULL,
    "routeId" TEXT,
    "vehicleId" TEXT,
    "tripId" TEXT,
    "kind" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "location" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "actionTaken" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "reportedBy" TEXT NOT NULL,
    "closedBy" TEXT,
    "closedAt" TIMESTAMP(3),
    "ridersAlerted" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transport_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_logs" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "odometer" INTEGER,
    "litres" DOUBLE PRECISION,
    "cost" INTEGER NOT NULL DEFAULT 0,
    "vendor" TEXT,
    "notes" TEXT,
    "by" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_logs_pkey" PRIMARY KEY ("id")
);

-- Carry the existing data across ---------------------------------------------

-- Each bus named on a route becomes a vehicle in the fleet. Seats default to
-- 40 and the papers are left blank for the transport desk to fill in.
INSERT INTO "vehicles" ("id", "regNo", "capacity", "notes")
SELECT DISTINCT ON (upper(trim("busNo"))) 'veh_' || "id", upper(trim("busNo")), 40, 'Created from route ' || "routeNo" || '; check seats and papers'
FROM "transport_routes" WHERE coalesce(trim("busNo"), '') <> ''
ORDER BY upper(trim("busNo")), "routeNo";

UPDATE "transport_routes" r SET "vehicleId" = v."id"
FROM "vehicles" v WHERE v."regNo" = upper(trim(r."busNo"));

-- Each driver named on a route becomes a crew record; the licence is to be filled in.
INSERT INTO "transport_crew" ("id", "name", "phone", "role")
SELECT DISTINCT ON (trim("driver"), trim("driverPhone")) 'crew_' || "id", trim("driver"), trim("driverPhone"), 'DRIVER'
FROM "transport_routes" WHERE coalesce(trim("driver"), '') <> ''
ORDER BY trim("driver"), trim("driverPhone"), "routeNo";

UPDATE "transport_routes" r SET "driverId" = c."id"
FROM "transport_crew" c WHERE c."name" = trim(r."driver") AND c."phone" = trim(r."driverPhone");

-- Passes issued before: numbered, and active or cancelled as they were.
UPDATE "bus_passes" SET "passNo" = 'BP/' || to_char("validTill", 'YYYY') || '/' || upper(substr("id", length("id") - 7)),
  "status" = CASE WHEN "valid" THEN 'ACTIVE'::"BusPassStatus" ELSE 'CANCELLED'::"BusPassStatus" END;
ALTER TABLE "bus_passes" ALTER COLUMN "passNo" SET NOT NULL;

ALTER TABLE "transport_routes" DROP COLUMN "busNo",
DROP COLUMN "currentStop",
DROP COLUMN "driver",
DROP COLUMN "driverPhone";

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_regNo_key" ON "vehicles"("regNo");

-- CreateIndex
CREATE UNIQUE INDEX "transport_requests_requestNo_key" ON "transport_requests"("requestNo");

-- CreateIndex
CREATE INDEX "transport_requests_status_idx" ON "transport_requests"("status");

-- CreateIndex
CREATE INDEX "transport_trips_status_idx" ON "transport_trips"("status");

-- CreateIndex
CREATE UNIQUE INDEX "transport_trips_routeId_date_shift_key" ON "transport_trips"("routeId", "date", "shift");

-- CreateIndex
CREATE UNIQUE INDEX "trip_stop_events_tripId_stopOrder_key" ON "trip_stop_events"("tripId", "stopOrder");

-- CreateIndex
CREATE UNIQUE INDEX "trip_boardings_tripId_studentId_key" ON "trip_boardings"("tripId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "transport_incidents_incidentNo_key" ON "transport_incidents"("incidentNo");

-- CreateIndex
CREATE INDEX "transport_incidents_status_idx" ON "transport_incidents"("status");

-- CreateIndex
CREATE INDEX "vehicle_logs_vehicleId_date_idx" ON "vehicle_logs"("vehicleId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "bus_passes_passNo_key" ON "bus_passes"("passNo");

-- CreateIndex
CREATE INDEX "bus_passes_routeId_status_idx" ON "bus_passes"("routeId", "status");

-- AddForeignKey
ALTER TABLE "transport_routes" ADD CONSTRAINT "transport_routes_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_routes" ADD CONSTRAINT "transport_routes_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "transport_crew"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_routes" ADD CONSTRAINT "transport_routes_attendantId_fkey" FOREIGN KEY ("attendantId") REFERENCES "transport_crew"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bus_passes" ADD CONSTRAINT "bus_passes_stopId_fkey" FOREIGN KEY ("stopId") REFERENCES "route_stops"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_requests" ADD CONSTRAINT "transport_requests_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_requests" ADD CONSTRAINT "transport_requests_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "transport_routes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_requests" ADD CONSTRAINT "transport_requests_stopId_fkey" FOREIGN KEY ("stopId") REFERENCES "route_stops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_trips" ADD CONSTRAINT "transport_trips_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "transport_routes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_trips" ADD CONSTRAINT "transport_trips_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_trips" ADD CONSTRAINT "transport_trips_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "transport_crew"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_stop_events" ADD CONSTRAINT "trip_stop_events_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "transport_trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_boardings" ADD CONSTRAINT "trip_boardings_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "transport_trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_boardings" ADD CONSTRAINT "trip_boardings_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_boardings" ADD CONSTRAINT "trip_boardings_passId_fkey" FOREIGN KEY ("passId") REFERENCES "bus_passes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_incidents" ADD CONSTRAINT "transport_incidents_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "transport_routes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_incidents" ADD CONSTRAINT "transport_incidents_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_incidents" ADD CONSTRAINT "transport_incidents_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "transport_trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_logs" ADD CONSTRAINT "vehicle_logs_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

