-- Add featuredOrder column to meals table
ALTER TABLE "meals"
ADD COLUMN IF NOT EXISTS "featuredOrder" INTEGER NOT NULL DEFAULT 0;

