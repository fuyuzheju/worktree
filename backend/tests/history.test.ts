import HistoryManager from "@/history.js";
import { createDatabaseManager } from "@/webAPI/public.js";
import { Operation } from "@/data/core.js";
import { execSync } from "child_process";
import { PrismaClient } from "@prisma/client";

const op = new Operation({
    opType: "addNode",
    payload: {
        newNodeName: "1",
        parentNodeId: "1",
        newNodeId: "2",
    },
    timestamp: 0,
});

let prisma: PrismaClient; // only used to clean up database
describe("history management", () => {
    beforeAll(async () => {
        process.env.DATABASE_URL = "file:./history-management.test.db"
        execSync('npx prisma db push --force-reset');
        prisma = new PrismaClient();
    });

    beforeEach(async () => {
        await prisma.historyMetadata.deleteMany();
        await prisma.confirmedHistory.deleteMany();
        await prisma.user.deleteMany();
    });

    it("inserts operation", async () => {
        const manager = createDatabaseManager();
        const historyManager = new HistoryManager();
        const user = await manager.createUser("abc", "pwdabc");
        expect(user.name).toBe("abc");
        expect(user.password_hash).toBe("pwdabc");

        await expect(historyManager.insertAtHead(op, user.id)).resolves.toBe(0);

        const head = await historyManager.getHeadNode(user.id);
        expect(head).not.toBe(null);
        if (head === null) return; // let TypeScript know it
        expect(head.serial_num).toBe(0);
        expect(head.operation).toBe(op.stringify());
        expect(head.history_hash).toBe('dd76856ab09a33209f2212284718d8b07ca78110fc12ce43fefac351742b0651'); // same as python part
        expect(head.next_id).toBe(null);
    });

    it("deletes operation", async () => {
        const manager = createDatabaseManager();
        const historyManager = new HistoryManager();
        await expect(historyManager.getHeadNode("11")).resolves.toBe(null);
        const user = await manager.createUser("abd", "pwdabc");
        await expect(historyManager.insertAtHead(op, user.id)).resolves.toBe(0);
        await expect(historyManager.popHead(user.id)).resolves.toBe(0);
        await expect(historyManager.getHeadNode(user.id)).resolves.toBe(null);
    })
})

