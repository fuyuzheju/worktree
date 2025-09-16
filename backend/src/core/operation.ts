import assert from "assert";
import { stringify } from "canonical-json";
import { z, ZodType } from "zod";
import Tree from "./tree.js";

export enum OperationType {
    ADD_NODE = "add_node",
    REOPEN_NODE = "reopen_node",
    COMPLETED_NODE = "complete_node",
    REMOVE_NODE = "remove_node",
    REMOVE_SUBTREE = "remove_subtree",
    MOVE_NODE = "move_node",
}

enum PseudoOperationType {
    UNDO = "undo",
    FLUSH = "flush",
}

export enum ExtOperationType {
    ADD_NODE = OperationType.ADD_NODE,
    REOPEN_NODE = OperationType.REOPEN_NODE,
    COMPLETED_NODE = OperationType.COMPLETED_NODE,
    REMOVE_NODE = OperationType.REMOVE_NODE,
    REMOVE_SUBTREE = OperationType.REMOVE_SUBTREE,
    MOVE_NODE = OperationType.MOVE_NODE,

    // extended
    UNDO = PseudoOperationType.UNDO,
    FLUSH = PseudoOperationType.FLUSH,
}

const methodNameMap: Record<OperationType, keyof Tree> = {
    [OperationType.ADD_NODE]: "addNode",
    [OperationType.REOPEN_NODE]: "reopenNode",
    [OperationType.COMPLETED_NODE]: "completeNode",
    [OperationType.REMOVE_NODE]: "removeNode",
    [OperationType.REMOVE_SUBTREE]: "removeSubtree",
    [OperationType.MOVE_NODE]: "moveNode",
}

const methodParamsMap: Record<OperationType, ZodType> = {
    [OperationType.ADD_NODE]: z.object({
        parentNodeId: z.string(),
        newNodeName: z.string(),
        newNodeId: z.string().optional(),
    }),

    [OperationType.REOPEN_NODE]: z.object({
        nodeId: z.string(),
    }),

    [OperationType.COMPLETED_NODE]: z.object({
        nodeId: z.string(),
    }),

    [OperationType.REMOVE_NODE]: z.object({
        nodeId: z.string(),
    }),

    [OperationType.REMOVE_SUBTREE]: z.object({
        nodeId: z.string(),
    }),

    [OperationType.MOVE_NODE]: z.object({
        nodeId: z.string(),
        newParentId: z.string(),
    })
}

interface OperationAttrs {
    opType: OperationType,
    payload: object,
    timestamp: number,
}

export default class Operation {
    opType: OperationType;
    payload: object;
    timestamp: number;

    constructor({
        opType,
        payload,
        timestamp,
    }: OperationAttrs) {
        this.opType = opType;
        this.payload = payload;
        this.timestamp = timestamp;
    }

    stringify(): string {
        return stringify({
            op_type: this.opType,
            payload: this.payload,
            timestamp: this.timestamp,
        });
    }

    apply(tree: Tree): number {
        let method = tree[methodNameMap[this.opType]];
        assert(typeof method === "function");

        const schema = methodParamsMap[this.opType];
        const payload = schema.parse(this.payload);

        // @ts-expect-error: this is already safe, cuz we've checked it with zod schema
        return method.call(tree, payload);
    }
}
