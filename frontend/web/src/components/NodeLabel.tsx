import { Fragment } from 'react';
import type { ReactNode } from 'react';
import { ROOT_ID } from '@worktree/core';
import type { Node } from '@worktree/core';
import type { DisplayPrefs } from '../config';
import { nodeRowParts, shortId } from '../render';
import type { NodeRowPart } from '../render';
import { CheckIcon, ClockIcon, PencilIcon } from './icons';

/** Icons for the markers formatNode renders as glyphs (✔ ⏰ ✎). */
const markerClass = 'inline h-3.5 w-3.5 align-[-3px]';

/** One node row, same token order as the CLI format, but markers as SVG icons. */
export function NodeLabel({ node, display }: { node: Node; display: DisplayPrefs }): ReactNode {
  return nodeRowParts(node, display).map((part, i) => (
    <Fragment key={i}>
      {renderPart(part)}
      {' '}
    </Fragment>
  ));
}

function renderPart(part: NodeRowPart): ReactNode {
  switch (part.type) {
    case 'name':
      return <span>{part.text}</span>;
    case 'id':
      return (
        <span className="opacity-70">
          [{shortId(part.id)}]
        </span>
      );
    case 'status':
      return <CheckIcon className={markerClass} />;
    case 'weight':
      return <span>w:{part.weight}</span>;
    case 'deadline':
      return (
        <span className="inline-flex items-center gap-0.5">
          <ClockIcon className={markerClass} />
          {new Date(part.ms).toISOString()}
        </span>
      );
    case 'note':
      return (
        <span className="inline-flex items-center gap-0.5">
          <PencilIcon className={markerClass} />
          {part.text}
        </span>
      );
    case 'reminders':
      return (
        <span>
          R({part.count}):{part.text}
        </span>
      );
  }
}

/** The tree headline: `name` for the worktree root, the node row itself otherwise. */
export function RootLabel({
  node,
  display,
  name,
}: {
  node: Node;
  display: DisplayPrefs;
  name: string;
}): ReactNode {
  return node.id === ROOT_ID ? <>{name}</> : <NodeLabel node={node} display={display} />;
}
