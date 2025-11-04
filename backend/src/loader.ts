// load tree from history

import HistoryManager from "./history.js";
import { Tree, Operation } from "./data/core.js";
import type { OperationType } from "./data/core.js";
import { parseOperation } from "./data/utils.js";

export class TreeLoader {
    historyManager: HistoryManager;
    trees: Record<string, Tree>;

    constructor(historyManager: HistoryManager) {
        this.historyManager = historyManager;
        this.trees = {};
    }

    async reload(userId: string): Promise<number> {
        this.trees[userId] = new Tree();
        let operationStack: Operation<OperationType>[] = [];
        let head = await this.historyManager.getHeadNode(userId);
        while (head !== null) {
            const operation = parseOperation(head.operation);
            if (operation === null) throw new Error("Data damage");
            operationStack.push(operation);
            if (head.nextId === null) break;
            head = await this.historyManager.getById(head.nextId);
        }
        while (true) {
            const operation = operationStack.pop();
            if (operation === undefined) break;
            const retcode = operation.apply(this.trees[userId]);
            if (retcode === 0) throw new Error("Data damage");
        }
        return 0;
    }

    pushOperation(operation: Operation<OperationType>, userId: number): number {
        const tree = this.trees[userId];
        if (tree === undefined) return -1;
        const retcode = operation.apply(tree);
        return retcode;
    }
}