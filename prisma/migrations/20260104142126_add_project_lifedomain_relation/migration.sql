-- CreateTable
CREATE TABLE "public"."_ProjectLifeDomains" (
    "A" INTEGER NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ProjectLifeDomains_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_ProjectLifeDomains_B_index" ON "public"."_ProjectLifeDomains"("B");

-- AddForeignKey
ALTER TABLE "public"."_ProjectLifeDomains" ADD CONSTRAINT "_ProjectLifeDomains_A_fkey" FOREIGN KEY ("A") REFERENCES "public"."LifeDomain"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."_ProjectLifeDomains" ADD CONSTRAINT "_ProjectLifeDomains_B_fkey" FOREIGN KEY ("B") REFERENCES "public"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
