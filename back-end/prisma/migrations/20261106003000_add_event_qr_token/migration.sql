ALTER TABLE "Event" ADD COLUMN "qrToken" TEXT;

UPDATE "Event"
SET "qrToken" = md5(random()::text || clock_timestamp()::text)
WHERE "qrToken" IS NULL;

ALTER TABLE "Event"
ALTER COLUMN "qrToken" SET NOT NULL;

CREATE UNIQUE INDEX "Event_qrToken_key" ON "Event"("qrToken");
