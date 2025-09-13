import crypto from "crypto";

enum Status {
    WAITING = "Waiting",
    COMPLETED = "Completed",
}

interface NodeOptions {
    name: string,
    identity?: string,
    status?: Status,
    parent?: Node | null,
}

class Node {
    children: Node[];
    name: string;
    identity: string;
    status: Status;
    parent: Node | null;

    constructor({
        name,
        identity = crypto.randomUUID().replaceAll("-",""),
        status = Status.WAITING,
        parent = null,
    }: NodeOptions) {
        this.name = name;
        this.identity = identity;
        this.status = status;
        this.parent = parent;
        this.children = [];
    }

    addChild(child_node: Node) {
        this.children.push(child_node);
    }

    isReady() {
        return this.children.every(child => {child.status === Status.COMPLETED});
    }
}


export default class Tree {
    root: Node;

    constructor() {
        const INITIAL_ID = crypto.createHash("sha256").update("WorkRoot", "utf-8").digest("hex").slice(0,32);
        this.root = new Node({name: "WorkRoot", identity: INITIAL_ID});
    }

    getNodeById(identity: string): Node | undefined {
        function recursivelyGetNode(identity: string, node: Node): Node | undefined {
            if (node.identity === identity) {
                return node;
            }
            return node.children.reduce((found: Node | undefined, child: Node) => {
                if (found) {
                    return found;
                }
                return recursivelyGetNode(identity, child);
            }, undefined);
        }

        return recursivelyGetNode(identity, this.root);
    }

    addNode = ({parentNodeId,
                newNodeName,
                newNodeId = crypto.randomUUID().replaceAll("-", "")}: 
                    {parentNodeId: string, newNodeName: string, newNodeId?: string,}
            ): number => {
        let parentNode = this.getNodeById(parentNodeId);
        if (parentNode === undefined) {
            return -1;
        }
        if (parentNode.children.some(child => child.name === newNodeName)) {
            return -1;
        }

        let newNode = new Node({
            name: newNodeName,
            identity: newNodeId,
            parent: parentNode,
        });
        parentNode.addChild(newNode);
        return 0;
    }

    reopenNode = ({nodeId}: {nodeId: string}): number => {
        let node = this.getNodeById(nodeId);
        if (node === undefined || node.status !== Status.COMPLETED) {
            return -1;
        }

        function recursivelyReopen(curr: Node): number {
            if (curr.parent !== null && curr.parent.status === Status.COMPLETED) {
                let res = recursivelyReopen(curr.parent);
            }
            curr.status = Status.WAITING;
            return 0;
        }

        return recursivelyReopen(node);
    }

    completeNode = ({nodeId}: {nodeId: string}): number => {
        let node = this.getNodeById(nodeId);
        if (node === undefined || (!node.isReady())) {
            return -1;
        }
        if (node.status === Status.COMPLETED) {
            return -1;
        }
        node.status = Status.COMPLETED;
        return 0;
    }

    removeNode = ({nodeId}: {nodeId: string}): number => {
        let node = this.getNodeById(nodeId);
        if (node === undefined) {
            return -1;
        }
        if (!!node.children.length || (node.parent === null)) {
            return -1;
        }
        node.parent.children = node.parent.children.filter(child => child.identity !== nodeId);
        return 0;
    }

    removeSubtree = ({nodeId}: {nodeId: string}): number => {
        let node = this.getNodeById(nodeId);
        if (node === undefined || node.parent === null) {
            return -1;
        }

        node.parent.children = node.parent.children.filter(child => child.identity !== nodeId);
        return 0;
    }

    moveNode = ({nodeId, newParentId}: {nodeId: string, newParentId: string}): number => {
        let node = this.getNodeById(nodeId);
        if (node === undefined || node.parent === null) {
            return -1;
        }

        let newParent = this.getNodeById(newParentId);
        if (newParent === undefined) {
            return -1;
        }

        // you can't move a node to its child
        let curr: Node|null = newParent;
        while (curr !== null && curr.identity !== this.root.identity) {
            if (curr.identity === nodeId) {
                return -1;
            }
            curr = curr.parent;
        }

        if (newParent.children.some(child => child.name === node.name)) {
            return -1;
        }

        newParent.addChild(node);
        node.parent.children = node.parent.children.filter(child => child.identity !== node.identity);
        node.parent = newParent;
        return 0;
    }
}