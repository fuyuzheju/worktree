import { useState } from 'react';
import type { Block, Node } from '@worktree/core';
import type { WorktreeClient } from '@worktree/client';
import type { DisplayPrefs } from '../config';
import { useI18n } from '../i18n';
import { findNode } from '../tree-utils';
import { epochToLocalInput, localInputToEpoch } from '../time';
import { HOUR_MS } from '../calendar-utils';
import { NodePicker } from './NodePicker';
import { CheckIcon, ClockIcon, FlagIcon, LinkIcon, NoteIcon, PencilIcon, TrashIcon } from './icons';

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

  const inputClass = 'mt-1 flex-1 rounded border border-gray-300 px-2 py-1 text-gray-900';

  return (
    <div
      className="rounded border border-gray-300 bg-white p-4 pt-0 text-sm h-full overflow-auto"
      data-testid="block-detail"
    >
      <div
        className={`flex items-center justify-between ${
          bare === true ? 'sticky top-0 z-10 -mx-4 mb-1 bg-white px-4 py-1' : ''
        }`}
      >
        <h2 className="font-semibold">{block === null ? t('calendar.newTitle') : t('calendar.editTitle')}</h2>
        <button
          type="button"
          data-testid="block-cancel"
          onClick={onClose}
          className="rounded px-3 py-1.5 text-gray-500 hover:bg-gray-100 md:px-2 md:py-0.5"
        >
          ✕
        </button>
      </div>

      {block !== null && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            data-testid="block-complete"
            onClick={() => client.setBlockCompleted(block.id, !block.status)}
            className="inline-flex h-8 items-center gap-1.5 rounded bg-green-600 px-2 py-2 text-white hover:bg-green-700 md:py-1"
          >
            <CheckIcon className="h-4 w-4" />
            {block.status ? t('detail.uncomplete') : t('detail.complete')}
          </button>
          <button
            type="button"
            data-testid="block-delete"
            onClick={() => {
              if (window.confirm(t('calendar.deleteConfirm', { name: block.name }))) {
                client.removeBlock(block.id);
                onClose();
              }
            }}
            className="inline-flex h-8 items-center gap-1.5 rounded bg-red-600 px-2 py-2 text-white hover:bg-red-700 md:py-1"
          >
            <TrashIcon className="h-4 w-4" />
            {t('calendar.delete')}
          </button>
        </div>
      )}

      <div className="mt-3 space-y-3 text-sm">
        <div className="flex flex-col">
          <span className="flex items-center gap-1.5 text-sm font-semibold text-blue-600">
            <PencilIcon className="h-4 w-4" />
            {t('calendar.name')}
          </span>
          <input data-testid="block-name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </div>
        <div className="flex flex-col gap-3">
          <label className="flex-1 flex flex-col">
            <span className="flex items-center gap-1.5 text-sm font-semibold text-blue-600">
              <ClockIcon className="h-4 w-4" />
              {t('calendar.start')}
            </span>
            <input
              data-testid="block-start"
              type="datetime-local"
              step={1}
              value={startInput}
              onChange={(e) => setStartInput(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="flex-1 flex flex-col">
            <span className="flex items-center gap-1.5 text-sm font-semibold text-blue-600">
              <FlagIcon className="h-4 w-4" />
              {t('calendar.end')}
            </span>
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
        <label className="flex flex-col">
          <span className="flex items-center gap-1.5 text-sm font-semibold text-blue-600">
            <NoteIcon className="h-4 w-4" />
            {t('calendar.note')}
          </span>
          <textarea data-testid="block-note" value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} rows={2} />
        </label>

        <div>
          <span className="flex items-center gap-1.5 text-sm font-semibold text-blue-600">
            <LinkIcon className="h-4 w-4" />
            {t('calendar.linkedNode')}
          </span>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
            <button
              type="button"
              data-testid="block-link"
              onClick={() => setPickerOpen(true)}
              className="rounded px-2 py-1.5 text-blue-700 hover:bg-blue-50 md:px-1.5 md:py-0.5"
            >
              {linked?.name ?? t('calendar.noLink')}
            </button>
            {nodeId !== null && (
              <button
                type="button"
                data-testid="block-link-clear"
                onClick={() => setNodeId(null)}
                className="rounded px-2 py-1.5 text-red-700 hover:bg-red-50 md:px-1.5 md:py-0.5"
              >
                {t('calendar.clearLink')}
              </button>
            )}
          </div>
        </div>

        {error !== null && <p className="text-xs text-red-700">{error}</p>}

        <button
          type="button"
          data-testid="block-save"
          onClick={save}
          className="rounded border border-gray-400 bg-gray-100 px-2 py-2 font-medium text-gray-700 hover:bg-gray-200 md:py-1"
        >
          {t('calendar.save')}
        </button>
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
