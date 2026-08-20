import type { Node, Reminder, TreeOperation } from './types';

export const ROOT_ID = 'root';

/** The Node tree, derived by replaying TreeOperations in order. */
export class Tree {
  private root: Node;
  private index = new Map<string, Node>();
  private parents = new Map<string, string>();

  constructor() {
    this.root = { id: ROOT_ID, name: '', weight: 0, children: [], reminders: [], status: false };
    this.index.set(ROOT_ID, this.root);
  }

  static fromOps(ops: TreeOperation[]): Tree {
    const tree = new Tree();
    for (const op of ops) tree.apply(op);
    return tree;
  }

  /** Deep, state-equivalent copy (used by server-side validation probes). */
  clone(): Tree {
    const copy = new Tree();
    const cloneNode = (node: Node): Node => {
      const c: Node = {
        id: node.id,
        name: node.name,
        weight: node.weight,
        children: [],
        reminders: node.reminders.map((r) => ({ ...r })),
        status: node.status,
      };
      copy.index.set(c.id, c);
      c.children = node.children.map(cloneNode);
      for (const child of c.children) copy.parents.set(child.id, c.id);
      return c;
    };
    copy.root = cloneNode(this.root);
    return copy;
  }

  apply(op: TreeOperation): void {
    switch (op.kind) {
      case 'add': {
        const parent = this.mustGet(op.parentId);
        if (this.index.has(op.id)) throw new Error(`duplicate node id: ${op.id}`);
        const node: Node = { id: op.id, name: op.name, weight: op.weight, children: [], reminders: [], status: false };
        parent.children.push(node);
        this.sortChildren(parent);
        this.index.set(node.id, node);
        this.parents.set(node.id, op.parentId);
        break;
      }
      case 'remove':
        this.removeSubtree(op.id);
        break;
      case 'rename':
        this.mustGet(op.id).name = op.name;
        break;
      case 'move': {
        const parent = this.mustGet(op.parentId);
        const node = this.mustGet(op.id);
        if (this.isAncestor(node.id, op.parentId)) throw new Error('cannot move a node into its own subtree');
        const oldParent = this.mustGet(this.parents.get(op.id)!);
        oldParent.children = oldParent.children.filter((c) => c.id !== op.id);
        node.weight = op.weight;
        parent.children.push(node);
        this.sortChildren(parent);
        this.parents.set(op.id, op.parentId);
        break;
      }
      case 'copy': {
        const parent = this.mustGet(op.parentId);
        const src = this.mustGet(op.id);
        if (this.index.has(op.newId)) throw new Error(`duplicate node id: ${op.newId}`);
        const clone: Node = {
          id: op.newId,
          name: src.name,
          weight: op.weight,
          children: [],
          // Derived reminder ids keep replay deterministic and avoid
          // ambiguity between the source's and the copy's reminders.
          reminders: src.reminders.map((r: Reminder) => ({ ...r, id: `${op.newId}#${r.id}` })),
          status: src.status,
        };
        parent.children.push(clone);
        this.sortChildren(parent);
        this.index.set(clone.id, clone);
        this.parents.set(clone.id, op.parentId);
        break;
      }
      case 'complete':
        this.mustGet(op.id).status = true;
        break;
      case 'uncomplete':
        this.mustGet(op.id).status = false;
        break;
      case 'add_reminder': {
        const node = this.mustGet(op.nodeId);
        if (node.reminders.some((r) => r.id === op.rmdId)) throw new Error(`duplicate reminder id: ${op.rmdId}`);
        node.reminders.push({ id: op.rmdId, name: op.name, deadline: op.deadline, repeat: op.repeat, active: true });
        break;
      }
      case 'remove_reminder': {
        const node = this.findReminderNode(op.rmdId);
        if (node) node.reminders = node.reminders.filter((r) => r.id !== op.rmdId);
        break;
      }
      case 'edit_reminder': {
        const node = this.findReminderNode(op.rmdId);
        const reminder = node?.reminders.find((r) => r.id === op.rmdId);
        if (!reminder) throw new Error(`unknown reminder id: ${op.rmdId}`);
        if (op.name !== undefined) reminder.name = op.name;
        if (op.deadline !== undefined) reminder.deadline = op.deadline;
        if (op.repeat !== undefined) reminder.repeat = op.repeat ?? undefined;
        if (op.active !== undefined) reminder.active = op.active;
        break;
      }
    }
  }

  getRoot(): Node {
    return this.root;
  }

  getNode(id: string): Node | undefined {
    return this.index.get(id);
  }

  getParentId(id: string): string | undefined {
    return this.parents.get(id);
  }

  nodeCount(): number {
    return this.index.size - 1;
  }

  reminderCount(): number {
    let n = 0;
    for (const node of this.index.values()) n += node.reminders.length;
    return n;
  }

  private mustGet(id: string): Node {
    const node = this.index.get(id);
    if (!node) throw new Error(`unknown node id: ${id}`);
    return node;
  }

  /** Sibling order: ascending (weight, id) — deterministic across replays. */
  private sortChildren(parent: Node): void {
    parent.children.sort((a, b) => a.weight - b.weight || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  /** Whether `ancestorId` is an ancestor of `id`. */
  private isAncestor(ancestorId: string, id: string): boolean {
    let cur = this.parents.get(id);
    while (cur !== undefined) {
      if (cur === ancestorId) return true;
      cur = this.parents.get(cur);
    }
    return false;
  }

  private removeSubtree(id: string): void {
    if (id === ROOT_ID) throw new Error('cannot remove root');
    const node = this.index.get(id);
    if (!node) return; // already gone — idempotent, so concurrent removes commute
    const parent = this.mustGet(this.parents.get(id)!);
    parent.children = parent.children.filter((c) => c.id !== id);
    const stack = [node];
    while (stack.length > 0) {
      const n = stack.pop()!;
      this.index.delete(n.id);
      this.parents.delete(n.id);
      stack.push(...n.children);
    }
  }

  private findReminderNode(rmdId: string): Node | undefined {
    for (const node of this.index.values()) {
      if (node.reminders.some((r) => r.id === rmdId)) return node;
    }
    return undefined;
  }
}
