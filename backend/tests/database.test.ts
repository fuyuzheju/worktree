import HistoryManager from "@/database.js";
import Operation from "@/core/operation.js";
import { OperationType } from "@/core/operation.js";

const historyManager = new HistoryManager();

const op = new Operation({
    opType: OperationType.ADD_NODE,
    payload: {},
    timestamp: 0,
})

describe("history management", () => {
    it("operation insertion", async () => {
        const user = await historyManager.createUser(11, "abc");
        expect(user.name).toBe("abc");

        await expect(historyManager.insertAtHead(op, 11)).resolves.toBe(0);

        const head = await historyManager.getHeadNode(11);
        expect(head).not.toBe(null);
        if (head===null) return;
        expect(head.serialNum).toBe(0);
        expect(head.operation).toBe(op.stringify());
        console.log(`this is ${op.stringify()}`);
        expect(head.historyHash).toBe('0c72fd5b08e5a98ee292aa208b8a95e12c25ab14dbeeacf0efa2d7f3d6ef33ff');
        expect(head.userId).toBe(11);
        expect(head.nextId).toBe(null);
    })
})

