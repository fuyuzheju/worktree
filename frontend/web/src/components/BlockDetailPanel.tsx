import { useState } from 'react';
import type { Block, Node } from '@worktree/core';
import type { WorktreeClient } from '@worktree/client';
import type { DisplayPrefs } from '../config';
import { useI18n } from '../i18n';
import { findNode } from '../tree-utils';
import { epochToLocalInput, localInputToEpoch } from '../time';
import { HOUR_MS } from '../calendar-utils';
import { NodePicker } from './NodePicker';

/**
 * Edit (or create) a calendar block. `block === null` means "new block".
 * The node link is chosen through the tree picker, never typed by hand.
 */
export function BlockDetailPanel(props: {
  block: Block | null;
  client: WorktreeClient;
  tree: Node;
  display: DisplayPrefs;
  /** Defaults the new block's start to the current hour. */
  nowMs?: number;
  /** The caller provides its own chrome (modal, bottom sheet). */
  bare?: boolean;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const { block, client, tree, display, nowMs = Date.now(), bare = false, onClose } = props;
  const [name, setName] = useState(block?.name ?? '');
  const [startInput, setStartInput] = useState(
    block !== null ? epochToLocalInput(block.start) : epochToLocalInput(Math.floor(nowMs / HOUR_MS) * HOUR_MS),
  );
  const [endInput, setEndInput] = useState(
    block !== null ? epochToLocalInput(block.end) : epochToLocalInput(Math.floor(nowMs / HOUR_MS) * HOUR_MS + HOUR_MS),
  );
  const [note, setNote] = useState(block?.note ?? '');
  const [nodeId, setNodeId] = useState<string | null>(block?.nodeId ?? null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const linked = nodeId !== null ? findNode(tree, nodeId) : undefined;

  const save = (): void => {
    const start = localInputToEpoch(startInput);
    const end = localInputToEpoch(endInput);
    if (name === '') {
      setError(t('calendar.nameRequired'));
      return;
    }
    if (start === null || end === null) {
      setError(t('calendar.timeRequired'));
      return;
    }
    if (start >= end) {
      setError(t('calendar.timeOrder'));
      return;
    }
    try {
      if (block === null) {
        client.addBlock({ name, start, end, note, nodeId: nodeId ?? undefined });
      } else {
        client.editBlock(block.id, { name, start, end, note, nodeId });
      }
      onClose();
    } catch (e) {
      setError(t('calendar.error', { message: e instanceof Error ? e.message : String(e) }));
    }
  };

  const inputClass = 'mt-1 w-full rounded border border-gray-300 px-2 py-1 text-gray-900';
  const buttonClass = 'rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50';

  return (
    <div className={bare ? 'p-4' : 'rounded border border-gray-300 bg-white p-4'} data-testid="block-detail">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">{block === null ? t('calendar.newTitle') : t('calendar.editTitle')}</h2>
        <button type="button" data-testid="block-cancel" onClick={onClose} className={buttonClass}>
          {t('calendar.cancel')}
        </button>
      </div>

      <div className="mt-3 space-y-3 text-sm">
        <label className="block">
          {t('calendar.name')}
          <input data-testid="block-name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </label>
        <div className="flex flex-col gap-3">
          <label className="block flex-1">
            {t('calendar.start')}
            <input
              data-testid="block-start"
              type="datetime-local"
              step={1}
              value={startInput}
              onChange={(e) => setStartInput(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="block flex-1">
            {t('calendar.end')}
            <input
              data-testid="block-end"
              type="datetime-local"
              step={1}
              value={endInput}
              onChange={(e) => setEndInput(e.target.value)}
              className={inputClass}
            />
          </label>
        </div>
        <label className="block">
          {t('calendar.note')}
          <textarea data-testid="block-note" value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} rows={2} />
        </label>

        <div>
          <span className="text-xs text-gray-500">{t('calendar.linkedNode')}: </span>
          <button
            type="button"
            data-testid="block-link"
            onClick={() => setPickerOpen(true)}
            className="rounded border border-gray-300 px-2 py-0.5 text-xs text-blue-700 hover:bg-gray-50"
          >
            {linked?.name ?? t('calendar.noLink')}
          </button>
          {nodeId !== null && (
            <button type="button" data-testid="block-link-clear" onClick={() => setNodeId(null)} className={`ml-2 ${buttonClass}`}>
              {t('calendar.clearLink')}
            </button>
          )}
        </div>

        {block !== null && (
          <label className="flex items-center gap-2">
            <input
              data-testid="block-complete"
              type="checkbox"
              checked={block.status}
              onChange={(e) => client.setBlockCompleted(block.id, e.target.checked)}
            />
            {t('calendar.complete')}
          </label>
        )}

        {error !== null && <p className="text-xs text-red-700">{error}</p>}

        <div className="flex justify-between pt-1">
          <div>
            {block !== null && (
              <button
                type="button"
                data-testid="block-delete"
                onClick={() => {
                  if (window.confirm(t('calendar.deleteConfirm', { name: block.name }))) {
                    client.removeBlock(block.id);
                    onClose();
                  }
                }}
                className="rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100"
              >
                {t('calendar.delete')}
              </button>
            )}
          </div>
          <button
            type="button"
            data-testid="block-save"
            onClick={save}
            className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700"
          >
            {t('calendar.save')}
          </button>
        </div>
      </div>

      {pickerOpen && (
        <NodePicker
          tree={tree}
          display={display}
          currentId={nodeId}
          onPick={(id) => setNodeId(id)}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}
