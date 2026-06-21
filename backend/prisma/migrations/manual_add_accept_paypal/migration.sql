-- AlterTable
ALTER TABLE "Settings" ADD COLUMN IF NOT EXISTS "acceptPayPal" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Branch" ADD COLUMN IF NOT EXISTS "acceptPayPal" BOOLEAN;





