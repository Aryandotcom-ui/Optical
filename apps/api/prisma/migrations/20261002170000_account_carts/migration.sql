-- One bag per signed-in customer: a guest bag is merged into it on sign-in.
DROP INDEX "Cart_userId_idx";

-- CreateIndex
CREATE UNIQUE INDEX "Cart_userId_key" ON "Cart"("userId");
