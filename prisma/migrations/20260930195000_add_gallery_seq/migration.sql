ALTER TABLE "Gallery" ADD COLUMN "seq" INTEGER;

-- 已有图集按创建时间由早到晚编号，同时间以 id 保证稳定顺序。
WITH numbered AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "createdAt" ASC, "id" ASC)::INTEGER AS "seq"
  FROM "Gallery"
)
UPDATE "Gallery" SET "seq" = numbered."seq"
FROM numbered WHERE "Gallery"."id" = numbered."id";

ALTER TABLE "Gallery" ALTER COLUMN "seq" SET NOT NULL;
CREATE UNIQUE INDEX "Gallery_seq_key" ON "Gallery"("seq");
