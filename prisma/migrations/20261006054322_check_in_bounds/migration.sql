ALTER TABLE "CheckIn"
ADD CONSTRAINT "CheckIn_dayIndex_check" CHECK ("dayIndex" >= 0 AND "dayIndex" < 30),
ADD CONSTRAINT "CheckIn_scoreSeconds_check" CHECK ("scoreSeconds" >= 18000 AND "scoreSeconds" < 104400);
