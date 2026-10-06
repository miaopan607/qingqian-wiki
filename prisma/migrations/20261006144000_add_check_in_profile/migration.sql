CREATE TABLE "CheckInProfile" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userUid" TEXT NOT NULL,
    "wechat" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CheckInProfile_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CheckInProfile_eventId_idx" ON "CheckInProfile"("eventId");
CREATE UNIQUE INDEX "CheckInProfile_eventId_userUid_key" ON "CheckInProfile"("eventId", "userUid");
ALTER TABLE "CheckInProfile" ADD CONSTRAINT "CheckInProfile_userUid_fkey" FOREIGN KEY ("userUid") REFERENCES "User"("uid") ON DELETE CASCADE ON UPDATE CASCADE;
