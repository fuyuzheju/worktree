import { Tree, Operation, TreeOperationPayloadSchemas } from "@/data/core.js";
import type { TreeOperationInterfaces } from "@/data/core.js";
import { parseOperation, isOperation } from "@/data/utils.js";
import crypto from "crypto";

const WORKROOT_ID = crypto.createHash("sha256").update("WorkRoot", "utf8").digest("hex").slice(0,32)

const operations: {op: Operation<any>, expected: number}[] = [
    {op: new Operation({
        opType: "addNode",
        payload: {
            parentNodeId: WORKROOT_ID,
            newNodeName: "1",
            newNodeId: "1",
        },
        timestamp: 0,
    }), expected: 0},

    {op: new Operation({
        opType: "addNode",
        payload: {
            parentNodeId: WORKROOT_ID,
            newNodeName: "2",
        },
        timestamp: 0,
    }), expected: 0},

    {op: new Operation({
        opType: "addNode",
        payload: {
            parentNodeId: WORKROOT_ID,
            newNodeName: "3",
            newNodeId: "3",
        },
        timestamp: 0,
    }), expected: 0},

    {op: new Operation({
        opType: "addNode",
        payload: {
            parentNodeId: WORKROOT_ID,
            newNodeName: "3",
        },
        timestamp: 0,
    }), expected: -1},

    {op: new Operation({
        opType: "removeNode",
        payload: {
            nodeId: "4",
        },
        timestamp: 0,
    }), expected: -1},

    {op: new Operation({
        opType: "addNode",
        payload: {
            parentNodeId: "3",
            newNodeName: "3.1",
        },
        timestamp: 0,
    }), expected: 0},

    {op: new Operation({
        opType: "removeNode",
        payload: {
            nodeId: "3",
        },
        timestamp: 0,
    }), expected: -1},

    {op: new Operation({
        opType: "removeSubtree",
        payload: {
            nodeId: "3",
        },
        timestamp: 0,
    }), expected: 0},
]

describe("core", () => {
    let tree = new Tree();
    it("tree creation", () => {
        expect(tree.root.name).toBe("WorkRoot");
        expect(tree.root.identity).
            toBe(WORKROOT_ID);
    });

    it("tree operation", () => {
        operations.reduce((prev_tree, e) => {
            const res = e.op.apply(prev_tree);
            expect(res).toBe(e.expected);
            return prev_tree;
        }, tree);
    });
});

const op1string: string = JSON.stringify({
    opType: "addNode",
    payload: {
        newNodeName: "1",
        parentNodeId: "2",
        newNodeId: "1",
    },
    timestamp: 0,
});
const op2string: string = JSON.stringify({
    opType: "removeNode",
    payload: {
        nodeId: "3",
    },
    timestamp: 0,
});
const op3string: string = JSON.stringify({
    opType: "addNode",
    payload: {
        newNodeName: "1",
        parentNodeId: "2",
    },
    timestamp: 0,
});
const iop1string: string = JSON.stringify({
    opType: "addNode",
    payload: {
        newNodeName: "1",
        pni: "2",
        newNodeId: "1",
    },
    timestamp: 0,
});
const iop2string: string = JSON.stringify({
    opType: "addNode",
    payload: {
        newNodeName: "1",
        parentNodeId: "2",
        newNodeId: "1",
    },
});
describe("utils", () => {
    const op1 = parseOperation(op1string);
    const op2 = parseOperation(op2string);
    const op3 = parseOperation(op3string);
    const iop1 = parseOperation(iop1string);
    const iop2 = parseOperation(iop2string);
    it("operation parsing", () => {
        expect(typeof op1).toBe("object");
        expect(op1?.opType).toBe("addNode");
        expect(typeof op2).toBe("object");
        expect(op2?.opType).toBe("removeNode");
        expect(typeof op3).toBe("object");
        expect(op3?.opType).toBe("addNode");
        expect(iop1).toBe(null);
        expect(iop2).toBe(null);
    });

    it("operation judging", () => {
        expect(isOperation(JSON.parse(op1string), "addNode")).toBe(true);
        expect(isOperation(JSON.parse(op2string), "removeNode")).toBe(true);
        expect(isOperation(JSON.parse(op3string), "addNode")).toBe(true);
        expect(isOperation(JSON.parse(iop1string), "addNode")).toBe(false);
        expect(isOperation(JSON.parse(iop2string), "addNode")).toBe(false);

    })
})
