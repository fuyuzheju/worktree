import { Tree, Operation } from "@/core.js";
import type { TreeOperationInterfaces } from "@/core.js";
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
})

