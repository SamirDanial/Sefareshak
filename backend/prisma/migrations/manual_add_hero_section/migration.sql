-- CreateTable
CREATE TABLE IF NOT EXISTS "hero_sections" (
    "id" TEXT NOT NULL,
    "badgeText" TEXT,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "backgroundImage" TEXT,
    "primaryButtonText" TEXT,
    "primaryButtonLink" TEXT,
    "secondaryButtonText" TEXT,
    "secondaryButtonLink" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hero_sections_pkey" PRIMARY KEY ("id")
);

