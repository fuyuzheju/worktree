// load tree from history

import HistoryManager from "./history.js";
import { Tree, Operation } from "./data/core.js";
import type { OperationType } from "./data/core.js";
import { parseOperation } from "./data/utils.js";
import type { AsyncLock } from "./webAPI/_shared.js";

export class TreeLoader {
    historyManager: HistoryManager;
    treeLock: AsyncLock;
    trees: Map<string, Tree>;

    constructor(historyManager: HistoryManager, treeLock: AsyncLock) {
        this.historyManager = historyManager;
        this.treeLock = treeLock;
        this.trees = new Map();
    }

    async cleanup(userId: string): Promise<number> {
        this.trees.delete(userId);
        return 0;
    }

    async reload(userId: string): Promise<number> {
        await this.treeLock.acquire(userId);
        this.trees.set(userId, new Tree());
        let operationStack: Operation<OperationType>[] = [];
        let curr = await this.historyManager.getHeadNode(userId);
        while (curr !== null) {
            const operation = parseOperation(curr.operation);
            if (operation === null){
                console.log(curr.operation);
                this.treeLock.release(userId);
                throw new Error("Data damage");
            }
            operationStack.push(operation);
            if (curr.next_id === null) break;
            const got = await this.historyManager.getByIds([curr.next_id]);
            curr = got[0] || null;
        }
        
        const tree = this.trees.get(userId);
        if (tree === undefined) return -1;
        while (true) {
            const operation = operationStack.pop();
            if (operation === undefined) break;
            const retcode = operation.apply(tree);
            if (retcode !== 0) {
                console.log(operation);
                this.treeLock.release(userId);
                throw new Error("Data damage");
            }
        }
        this.treeLock.release(userId);
        return 0;
    }

    pushOperation(operation: Operation<OperationType>, userId: string): number {
        const tree = this.trees.get(userId);
        if (tree === undefined) return -1;
        const retcode = operation.apply(tree);
        return retcode;
    }
}