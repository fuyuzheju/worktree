-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "ConfirmedHistory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "serial_num" INTEGER NOT NULL,
    "operation" TEXT NOT NULL,
    "history_hash" TEXT NOT NULL,
    "next_id" INTEGER,
    "user_id" TEXT NOT NULL,
    CONSTRAINT "ConfirmedHistory_next_id_fkey" FOREIGN KEY ("next_id") REFERENCES "ConfirmedHistory" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ConfirmedHistory_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "HistoryMetadata" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "head_id" INTEGER,
    "user_id" TEXT NOT NULL,
    CONSTRAINT "HistoryMetadata_head_id_fkey" FOREIGN KEY ("head_id") REFERENCES "ConfirmedHistory" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "HistoryMetadata_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_name_key" ON "User"("name");

-- CreateIndex
CREATE UNIQUE INDEX "HistoryMetadata_head_id_key" ON "HistoryMetadata"("head_id");

-- CreateIndex
CREATE UNIQUE INDEX "HistoryMetadata_user_id_key" ON "HistoryMetadata"("user_id");
