-- AlterTable
ALTER TABLE "order_item_addons" ADD COLUMN "addon_id" TEXT;
ALTER TABLE "order_item_addons" ADD COLUMN "addon_type" "AddOnType" NOT NULL DEFAULT 'BOOLEAN';
ALTER TABLE "order_item_addons" ADD COLUMN "quantity" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "order_item_addons" ADD COLUMN "addon_description" TEXT;

-- AddForeignKey
ALTER TABLE "order_item_addons" ADD CONSTRAINT "order_item_addons_addon_id_fkey" FOREIGN KEY ("addon_id") REFERENCES "addons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
