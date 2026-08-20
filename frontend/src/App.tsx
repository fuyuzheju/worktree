import { useEffect, useRef, useState } from 'react';
import { WorktreeClient } from '@worktree/client';
import { ROOT_ID, newId } from '@worktree/core';
import type { Node } from '@worktree/core';
import { TreeView } from './components/TreeView';
import { useTree } from './hooks/useTree';

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3000';

export default function App() {
  const clientRef = useRef<WorktreeClient | null>(null);
  clientRef.current ??= new WorktreeClient({ serverUrl: SERVER_URL });
  const client = clientRef.current;

  const tree = useTree(client);
  const [conflict, setConflict] = useState(() => client.getConflict());

  useEffect(() => {
    const unsubscribe = client.subscribe(() => setConflict(client.getConflict()));
    client.connect();
    return () => {
      unsubscribe();
      client.disconnect();
    };
  }, [client]);

  const onAdd = (parentId: string, name: string) =>
    client.apply({ kind: 'add', parentId, id: newId(), name, weight: 0 });
  const onRemove = (id: string) => client.apply({ kind: 'remove', id });
  const onToggle = (id: string) => {
    const node = findNode(tree, id);
    if (!node) return;
    client.apply({ kind: node.status ? 'uncomplete' : 'complete', id });
  };

  return (
    <main>
      <header>
        <h1>WORKTREE</h1>
        <span className={`state ${client.isOnline() ? 'online' : 'offline'}`}>
          {client.isOnline() ? 'online' : 'offline'}
        </span>
        <button onClick={() => void client.sync()}>sync</button>
      </header>
      <button onClick={() => onAdd(ROOT_ID, 'new node')}>add root node</button>
      <TreeView node={tree} onAdd={onAdd} onRemove={onRemove} onToggle={onToggle} />
      <ConflictPanel client={client} />
    </main>
  );
}

function ConflictPanel({ client }: { client: WorktreeClient }) {
  const conflict = client.getConflict();
  if (!conflict) return null;
  return (
    <aside className="conflict">
      <h2>sync conflict</h2>
      <p>The server moved ahead. Choose which side to keep:</p>
      <div className="conflict-branches">
        <section>
          <h3>server</h3>
          <ul>
            {conflict.serverBranch.map((n) => (
              <li key={n.id}>
                {n.op.kind} {n.id}
              </li>
            ))}
          </ul>
          <button onClick={() => void client.resolveConflict('server')}>keep server</button>
        </section>
        <section>
          <h3>mine</h3>
          <ul>
            {conflict.localBranch.map((p) => (
              <li key={p.id}>
                {p.kind === 'add' ? p.op.kind : p.kind} {p.id}
              </li>
            ))}
          </ul>
          <button onClick={() => void client.resolveConflict('local')}>keep mine (rewrite)</button>
        </section>
      </div>
    </aside>
  );
}

function findNode(node: Node, id: string): Node | undefined {
  if (node.id === id) return node;
  for (const child of node.children) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return undefined;
}
