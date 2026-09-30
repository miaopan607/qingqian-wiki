-- CreateIndex
CREATE INDEX "ApiKey_userUid_sessionVersion_revokedAt_expiresAt_idx" ON "ApiKey"("userUid", "sessionVersion", "revokedAt", "expiresAt");
