-- CreateTable
CREATE TABLE "HistoryNode" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "opId" TEXT NOT NULL,
    "parentOpId" TEXT,
    "op" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Meta" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "HistoryNode_opId_key" ON "HistoryNode"("opId");
