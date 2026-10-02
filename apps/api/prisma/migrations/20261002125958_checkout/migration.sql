-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "cartId" UUID,
ADD COLUMN     "idempotencyHash" TEXT;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "actionUrl" TEXT;

-- AlterTable
ALTER TABLE "Prescription" ADD COLUMN     "ownerTokenHash" TEXT;

-- AlterTable
ALTER TABLE "StockReservation" ADD COLUMN     "committedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Prescription_ownerTokenHash_idx" ON "Prescription"("ownerTokenHash");

-- A hold either ends without a sale or becomes one, never both.
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_outcome_check"
  CHECK ("releasedAt" IS NULL OR "committedAt" IS NULL);
-- The expiry job scans only open holds.
CREATE INDEX "StockReservation_open_idx" ON "StockReservation" ("expiresAt")
  WHERE "releasedAt" IS NULL AND "committedAt" IS NULL;
-- Never hold more units than are on the shelf: the database refuses to oversell.
ALTER TABLE "StockItem" ADD CONSTRAINT "StockItem_reserved_check" CHECK ("reserved" <= "onHand");
