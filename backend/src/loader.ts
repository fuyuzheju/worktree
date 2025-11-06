// load tree from history

import HistoryManager from "./history.js";
import { Tree, Operation } from "./data/core.js";
import type { OperationType } from "./data/core.js";
import { parseOperation } from "./data/utils.js";

export class TreeLoader {
    historyManager: HistoryManager;
    trees: Map<string, Tree>;

    constructor(historyManager: HistoryManager) {
        this.historyManager = historyManager;
        this.trees = new Map();
    }

    async cleanup(userId: string): Promise<number> {
        this.trees.delete(userId);
        return 0;
    }

    async reload(userId: string): Promise<number> {
        this.trees.set(userId, new Tree());
        let operationStack: Operation<OperationType>[] = [];
        let curr = await this.historyManager.getHeadNode(userId);
        while (curr !== null) {
            const operation = parseOperation(curr.operation);
            if (operation === null) throw new Error("Data damage");
            operationStack.push(operation);
            if (curr.next_id === null) break;
            const got = await this.historyManager.getByIds([curr.next_id]);
            curr = got[0] || null;
        }
        
        while (true) {
            const operation = operationStack.pop();
            if (operation === undefined) break;
            const retcode = operation.apply(this.trees.get(userId)!);
            if (retcode === 0) throw new Error("Data damage");
        }
        return 0;
    }

    pushOperation(operation: Operation<OperationType>, userId: string): number {
        const tree = this.trees.get(userId);
        if (tree === undefined) return -1;
        const retcode = operation.apply(tree);
        return retcode;
    }
}