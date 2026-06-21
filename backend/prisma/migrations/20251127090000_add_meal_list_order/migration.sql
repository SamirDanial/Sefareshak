-- Add listOrder column to meals table
ALTER TABLE "meals"
ADD COLUMN IF NOT EXISTS "listOrder" INTEGER NOT NULL DEFAULT 0;

-- Backfill listOrder per category based on creation order
WITH ordered_meals AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "categoryId"
      ORDER BY "createdAt" ASC
    ) AS row_number
  FROM "meals"
)
UPDATE "meals" AS m
SET "listOrder" = ordered_meals.row_number
FROM ordered_meals
WHERE m."id" = ordered_meals."id";

