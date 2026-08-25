-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ReminderFire" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "rmdId" TEXT NOT NULL,
    "occurrence" BIGINT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" INTEGER NOT NULL,
    CONSTRAINT "ReminderFire_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ReminderFire" ("createdAt", "id", "occurrence", "rmdId", "userId") SELECT "createdAt", "id", "occurrence", "rmdId", "userId" FROM "ReminderFire";
DROP TABLE "ReminderFire";
ALTER TABLE "new_ReminderFire" RENAME TO "ReminderFire";
CREATE UNIQUE INDEX "ReminderFire_userId_rmdId_occurrence_key" ON "ReminderFire"("userId", "rmdId", "occurrence");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

