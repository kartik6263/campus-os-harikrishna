-- CreateTable
CREATE TABLE "institution" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "name" TEXT NOT NULL,
    "nameHi" TEXT,
    "shortCode" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'University',
    "tagline" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "pincode" TEXT,
    "country" TEXT NOT NULL DEFAULT 'India',
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "emailDomain" TEXT,
    "helpdesk" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "institution_pkey" PRIMARY KEY ("id")
);
