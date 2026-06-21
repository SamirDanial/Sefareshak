-- CreateEnum
CREATE TYPE "SizeType" AS ENUM ('S', 'M', 'L', 'XL');

-- AlterTable: Add sizeType to meal_sizes with default value
ALTER TABLE "meal_sizes" ADD COLUMN "sizeType" "SizeType" DEFAULT 'M'::"SizeType";

-- Migrate existing meal sizes: Map names to size types
-- Try to match common patterns, default to M if unclear
UPDATE "meal_sizes" 
SET "sizeType" = CASE 
  WHEN LOWER(name) LIKE '%small%' OR LOWER(name) LIKE '%s%' OR LOWER(name) = 's' THEN 'S'::"SizeType"
  WHEN LOWER(name) LIKE '%large%' OR LOWER(name) LIKE '%l%' OR LOWER(name) = 'l' THEN 'L'::"SizeType"
  WHEN LOWER(name) LIKE '%xl%' OR LOWER(name) LIKE '%extra%' OR LOWER(name) = 'xl' THEN 'XL'::"SizeType"
  WHEN LOWER(name) LIKE '%medium%' OR LOWER(name) LIKE '%m%' OR LOWER(name) = 'm' THEN 'M'::"SizeType"
  ELSE 'M'::"SizeType"
END;

-- Make sizeType required after migration (default is already set, so this is safe)
ALTER TABLE "meal_sizes" ALTER COLUMN "sizeType" SET NOT NULL;
ALTER TABLE "meal_sizes" ALTER COLUMN "sizeType" SET DEFAULT 'M'::"SizeType";

-- Add unique constraint for mealId + sizeType
ALTER TABLE "meal_sizes" ADD CONSTRAINT "meal_sizes_mealId_sizeType_key" UNIQUE ("mealId", "sizeType");

-- CreateTable: AddonSize
CREATE TABLE "addon_sizes" (
    "id" TEXT NOT NULL,
    "addonId" TEXT NOT NULL,
    "sizeType" "SizeType" NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "taxPercentage" DECIMAL(5,2),

    CONSTRAINT "addon_sizes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: Unique constraint for addonId + sizeType
CREATE UNIQUE INDEX "addon_sizes_addonId_sizeType_key" ON "addon_sizes"("addonId", "sizeType");

-- Migrate existing addon prices to addon_sizes (default to M size)
INSERT INTO "addon_sizes" ("id", "addonId", "sizeType", "price", "taxPercentage")
SELECT 
    gen_random_uuid()::text as "id",
    "id" as "addonId",
    'M'::"SizeType" as "sizeType",
    "price",
    "taxPercentage"
FROM "addons"
WHERE "price" IS NOT NULL;

-- AddForeignKey for addon_sizes
ALTER TABLE "addon_sizes" ADD CONSTRAINT "addon_sizes_addonId_fkey" FOREIGN KEY ("addonId") REFERENCES "addons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: Remove price from addons (moved to addon_sizes)
ALTER TABLE "addons" DROP COLUMN "price";

-- AlterTable: Add mealSizeType to order_items (nullable, no default needed as it's optional)
ALTER TABLE "order_items" ADD COLUMN "mealSizeType" "SizeType";

-- Migrate existing selectedSize to mealSizeType where possible
-- Try to infer from selectedSize name
UPDATE "order_items"
SET "mealSizeType" = CASE 
  WHEN LOWER("selectedSize") LIKE '%small%' OR LOWER("selectedSize") LIKE '%s%' OR LOWER("selectedSize") = 's' THEN 'S'::"SizeType"
  WHEN LOWER("selectedSize") LIKE '%large%' OR LOWER("selectedSize") LIKE '%l%' OR LOWER("selectedSize") = 'l' THEN 'L'::"SizeType"
  WHEN LOWER("selectedSize") LIKE '%xl%' OR LOWER("selectedSize") LIKE '%extra%' OR LOWER("selectedSize") = 'xl' THEN 'XL'::"SizeType"
  WHEN LOWER("selectedSize") LIKE '%medium%' OR LOWER("selectedSize") LIKE '%m%' OR LOWER("selectedSize") = 'm' THEN 'M'::"SizeType"
  ELSE 'M'::"SizeType"
END
WHERE "selectedSize" IS NOT NULL;

-- For orders without selectedSize, default to M
UPDATE "order_items"
SET "mealSizeType" = 'M'::"SizeType"
WHERE "mealSizeType" IS NULL;

-- AlterTable: Add addonSizeType to order_item_addons (nullable, no default needed as it's optional)
ALTER TABLE "order_item_addons" ADD COLUMN "addonSizeType" "SizeType";

-- Migrate existing order_item_addons: Default to M (since we migrated all addons to M)
UPDATE "order_item_addons"
SET "addonSizeType" = 'M'::"SizeType"
WHERE "addonSizeType" IS NULL;

