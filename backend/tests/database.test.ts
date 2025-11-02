import HistoryManager from "@/database.js";
import { Operation } from "@/core.js";
import { PrismaClient } from "../generated/prisma/index.js";

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

    it("operation insertion", async () => {
        const user = await historyManager.createUser(11, "abc");
        expect(user.name).toBe("abc");

        await expect(historyManager.insertAtHead(op, 11)).resolves.toBe(0);

        const head = await historyManager.getHeadNode(11);
        expect(head).not.toBe(null);
        if (head === null) return; // let TypeScript know it
        expect(head.serialNum).toBe(0);
        expect(head.operation).toBe(op.stringify());
        console.log(`this is ${op.stringify()}`);
        expect(head.historyHash).toBe('dd76856ab09a33209f2212284718d8b07ca78110fc12ce43fefac351742b0651'); // same as python part
        expect(head.userId).toBe(11);
        expect(head.nextId).toBe(null);
    });

    it("operation deletion", async () => {
        await expect(historyManager.getHeadNode(11)).resolves.toBe(null);
        const user = await historyManager.createUser(11, "abc");
        await expect(historyManager.insertAtHead(op, 11)).resolves.toBe(0);
        await expect(historyManager.popHead(11)).resolves.toBe(0);
        await expect(historyManager.getHeadNode(11)).resolves.toBe(null);
    })
})

