CREATE TABLE "CheckIn" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userUid" TEXT NOT NULL,
    "dayIndex" INTEGER NOT NULL,
    "checkedInAt" TIMESTAMP(3) NOT NULL,
    "scoreSeconds" INTEGER NOT NULL,
    CONSTRAINT "CheckIn_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CheckIn_eventId_userUid_idx" ON "CheckIn"("eventId", "userUid");
CREATE UNIQUE INDEX "CheckIn_eventId_userUid_dayIndex_key" ON "CheckIn"("eventId", "userUid", "dayIndex");
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_userUid_fkey" FOREIGN KEY ("userUid") REFERENCES "User"("uid") ON DELETE CASCADE ON UPDATE CASCADE;
