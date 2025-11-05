import HistoryManager from "@/history.js";
import { createUser } from "@/webAPI/public.js";
import { Operation } from "@/data/core.js";
import { PrismaClient } from "@prisma/client";

const historyManager = new HistoryManager();
const prisma = new PrismaClient();

const op = new Operation({
    opType: "addNode",
    payload: {
        newNodeName: "1",
        parentNodeId: "1",
        newNodeId: "2",
    },
    timestamp: 0,
});

describe("history management", () => {
    beforeEach(async () => {
        await prisma.historyMetadata.deleteMany();
        await prisma.confirmedHistory.deleteMany();
        await prisma.user.deleteMany();
    })

    it("inserts operation", async () => {
        const user = await createUser("abc", "pwdabc");
        expect(user.name).toBe("abc");
        expect(user.password_hash).toBe("pwdabc");

        await expect(historyManager.insertAtHead(op, user.id)).resolves.toBe(0);

        const head = await historyManager.getHeadNode(user.id);
        expect(head).not.toBe(null);
        if (head === null) return; // let TypeScript know it
        expect(head.serial_num).toBe(0);
        expect(head.operation).toBe(op.stringify());
        console.log(`this is ${op.stringify()}`);
        expect(head.history_hash).toBe('dd76856ab09a33209f2212284718d8b07ca78110fc12ce43fefac351742b0651'); // same as python part
        expect(head.next_id).toBe(null);
    });

    it("deletes operation", async () => {
        await expect(historyManager.getHeadNode("11")).resolves.toBe(null);
        const user = await createUser("abc", "pwdabc");
        await expect(historyManager.insertAtHead(op, user.id)).resolves.toBe(0);
        await expect(historyManager.popHead(user.id)).resolves.toBe(0);
        await expect(historyManager.getHeadNode(user.id)).resolves.toBe(null);
    })
})

