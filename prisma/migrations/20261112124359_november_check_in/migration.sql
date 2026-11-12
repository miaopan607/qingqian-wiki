-- AlterTable
ALTER TABLE "CheckInProfile" ADD COLUMN     "refreshMinute" INTEGER,
ALTER COLUMN "wechat" DROP NOT NULL;

-- CreateTable
CREATE TABLE "CheckInRefreshChange" (
    "id" SERIAL NOT NULL,
    "eventId" TEXT NOT NULL,
    "userUid" TEXT NOT NULL,
    "fromDayIndex" INTEGER NOT NULL,
    "refreshMinute" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CheckInRefreshChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckInAuditLog" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "actorUid" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "targetUid" TEXT NOT NULL,
    "targetName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CheckInAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CheckInRefreshChange_eventId_userUid_id_idx" ON "CheckInRefreshChange"("eventId", "userUid", "id");

-- CreateIndex
CREATE INDEX "CheckInAuditLog_eventId_createdAt_id_idx" ON "CheckInAuditLog"("eventId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "CheckInAuditLog_eventId_targetUid_createdAt_id_idx" ON "CheckInAuditLog"("eventId", "targetUid", "createdAt", "id");

-- AddForeignKey
ALTER TABLE "CheckInRefreshChange" ADD CONSTRAINT "CheckInRefreshChange_eventId_userUid_fkey" FOREIGN KEY ("eventId", "userUid") REFERENCES "CheckInProfile"("eventId", "userUid") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CheckInProfile" ADD CONSTRAINT "CheckInProfile_refreshMinute_check"
CHECK ("refreshMinute" BETWEEN 0 AND 1439);
ALTER TABLE "CheckInRefreshChange"
ADD CONSTRAINT "CheckInRefreshChange_refreshMinute_check" CHECK ("refreshMinute" BETWEEN 0 AND 1439),
ADD CONSTRAINT "CheckInRefreshChange_fromDayIndex_check" CHECK ("fromDayIndex" BETWEEN 0 AND 30);
ALTER TABLE "CheckIn" DROP CONSTRAINT "CheckIn_scoreSeconds_check";
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_scoreSeconds_check" CHECK (
  CASE WHEN "eventId" IN ('2026-11-22', 'dev-2026-11-22')
    THEN "scoreSeconds" >= 0 AND "scoreSeconds" < 172800
    ELSE "scoreSeconds" >= 18000 AND "scoreSeconds" < 104400
  END
);
