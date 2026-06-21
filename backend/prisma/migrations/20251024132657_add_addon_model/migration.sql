-- CreateEnum
CREATE TYPE "AddOnType" AS ENUM ('BOOLEAN', 'QUANTITY');

-- CreateTable
CREATE TABLE "addons" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(10,2) NOT NULL,
    "image" TEXT,
    "type" "AddOnType" NOT NULL DEFAULT 'BOOLEAN',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "addons_pkey" PRIMARY KEY ("id")
);

-- Migrate existing meal_addons data to addons table
INSERT INTO "addons" ("id", "name", "price", "type", "isActive", "createdAt", "updatedAt")
SELECT DISTINCT ON ("name")
    gen_random_uuid()::text as "id",
    "name",
    "price",
    'BOOLEAN'::"AddOnType" as "type",
    true as "isActive",
    NOW() as "createdAt",
    NOW() as "updatedAt"
FROM "meal_addons";

-- Add addOnId column to meal_addons (nullable for now)
ALTER TABLE "meal_addons" ADD COLUMN "addOnId" TEXT;

-- Update meal_addons to reference addons
UPDATE "meal_addons" ma
SET "addOnId" = a."id"
FROM "addons" a
WHERE ma."name" = a."name" AND ma."price" = a."price";

-- Make addOnId required
ALTER TABLE "meal_addons" ALTER COLUMN "addOnId" SET NOT NULL;

-- Drop old columns from meal_addons
ALTER TABLE "meal_addons" DROP COLUMN "name";
ALTER TABLE "meal_addons" DROP COLUMN "price";

-- Add unique constraint
ALTER TABLE "meal_addons" ADD CONSTRAINT "meal_addons_mealId_addOnId_key" UNIQUE ("mealId", "addOnId");

-- AddForeignKey
ALTER TABLE "meal_addons" ADD CONSTRAINT "meal_addons_addOnId_fkey" FOREIGN KEY ("addOnId") REFERENCES "addons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

