-- CreateTable
CREATE TABLE "User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "ConfirmedHistory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "serialNum" INTEGER NOT NULL,
    "operation" TEXT NOT NULL,
    "historyHash" TEXT NOT NULL,
    "nextId" INTEGER,
    "userId" INTEGER NOT NULL,
    CONSTRAINT "ConfirmedHistory_nextId_fkey" FOREIGN KEY ("nextId") REFERENCES "ConfirmedHistory" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ConfirmedHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "HistoryMetadata" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "headId" INTEGER,
    "userId" INTEGER NOT NULL,
    CONSTRAINT "HistoryMetadata_headId_fkey" FOREIGN KEY ("headId") REFERENCES "ConfirmedHistory" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "HistoryMetadata_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ConfirmedHistory_nextId_key" ON "ConfirmedHistory"("nextId");

-- CreateIndex
CREATE UNIQUE INDEX "HistoryMetadata_headId_key" ON "HistoryMetadata"("headId");

-- CreateIndex
CREATE UNIQUE INDEX "HistoryMetadata_userId_key" ON "HistoryMetadata"("userId");
