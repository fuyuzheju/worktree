import { useState } from 'react';
import type { ReactElement } from 'react';
import { ROOT_ID } from '@worktree/core';
import type { Node, Reminder } from '@worktree/core';
import type { WorktreeClient } from '@worktree/client';
import { useI18n } from '../i18n';
import { flattenTree, descendants } from '../tree-utils';
import { formatReminder } from '../render';
import { epochToLocalInput, localInputToEpoch } from '../time';

const REPEAT_PRESETS: { key: string; ms: number | null }[] = [
  { key: 'detail.repeatPresets.none', ms: null },
  { key: 'detail.repeatPresets.hour', ms: 3_600_000 },
  { key: 'detail.repeatPresets.day', ms: 86_400_000 },
  { key: 'detail.repeatPresets.week', ms: 604_800_000 },
];

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function parseOptionalWeight(raw: string): number | undefined {
  const value = raw.trim();
  if (value === '') return undefined;
  const n = Number(value);
  if (Number.isNaN(n) || !Number.isFinite(n)) throw new Error('weight must be a number');
  return n;
}

export function NodeDetailPanel(props: {
  node: Node;
  client: WorktreeClient;
  onClose: () => void;
  /** Embedded in a parent surface (e.g. the mobile bottom sheet): drop the card frame. */
  bare?: boolean;
}) {
  const { t } = useI18n();
  const { node, client, onClose, bare } = props;
  const [error, setError] = useState<string | null>(null);

  const [renameValue, setRenameValue] = useState(node.name);
  const [childName, setChildName] = useState('');
  const [childWeight, setChildWeight] = useState('');
  const [moveTarget, setMoveTarget] = useState(ROOT_ID);
  const [moveWeight, setMoveWeight] = useState('');
  const [copyTarget, setCopyTarget] = useState(ROOT_ID);
  const [copyWeight, setCopyWeight] = useState('');
  const [editingRmdId, setEditingRmdId] = useState<string | null>(null);

  if (node.id === ROOT_ID) {
    return <RootPanel client={client} onClose={onClose} bare={bare} />;
  }

  const tree = client.getTree();
  const flat = flattenTree(tree);
  const blocked = descendants(tree, node.id);
  const moveOptions = flat.filter((f) => f.node.id !== node.id && !blocked.has(f.node.id));

  const run = (fn: () => void): void => {
    try {
      fn();
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    }
  };

  const parentLabel = (parentId: string | null, depth: number, name: string): string => {
    if (parentId === null) return '—';
    const prefix = '  '.repeat(Math.max(0, depth - 1));
    return parentId === ROOT_ID ? `${prefix}/` : `${prefix}${name}`;
  };

  const parentSelect = (
    value: string,
    onChange: (v: string) => void,
    options: typeof flat,
  ): ReactElement => (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded border border-gray-300 px-2 py-1 font-mono text-xs sm:w-auto sm:flex-1"
    >
      {options.map((f) => (
        <option key={f.node.id} value={f.node.id}>
          {parentLabel(f.parentId, f.depth, f.node.name)}
        </option>
      ))}
    </select>
  );

  const onSubmitRename = (): void => {
    run(() => client.renameNode(node.id, renameValue.trim()));
  };

  const onSubmitAddChild = (): void => {
    const name = childName.trim();
    if (name === '') return;
    run(() => {
      client.addNode(node.id, name, parseOptionalWeight(childWeight));
      setChildName('');
      setChildWeight('');
    });
  };

  const onSubmitMove = (): void => {
    run(() => client.moveNode(node.id, moveTarget, parseOptionalWeight(moveWeight)));
  };

  const onSubmitCopy = (): void => {
    run(() => {
      client.copyNode(node.id, copyTarget, parseOptionalWeight(copyWeight));
      setCopyWeight('');
    });
  };

  const onRemove = (): void => {
    // Completed work is already done — removing it is safe and needs no prompt.
    if (!node.status && !window.confirm(t('detail.confirmRemove', { name: node.name }))) return;
    run(() => {
      client.removeNode(node.id);
      onClose();
    });
  };

  const reminders = node.reminders;

  return (
    <div
      data-detail
      className={"rounded border border-gray-300 bg-white p-4 pt-0 text-sm h-full overflow-auto"}
    >
      <div
        className={`flex items-center justify-between ${
          bare === true ? 'sticky top-0 z-10 -mx-4 mb-1 bg-white px-4 py-1' : ''
        }`}
      >
        <h1 className="font-semibold text-1.5xl">{t('detail.title')}</h1>
        <button
          type="button"
          onClick={onClose}
          className="rounded px-3 py-1.5 text-gray-500 hover:bg-gray-100 md:px-2 md:py-0.5"
        >
          ✕
        </button>
      </div>

      <dl className="mt-2 space-y-1 text-xs">
        <div className="flex gap-2">
          <dt className="w-16 text-gray-500">{t('detail.name')}</dt>
          <dd className="font-mono">{node.name}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-16 text-gray-500">{t('detail.id')}</dt>
          <dd className="font-mono" data-testid="detail-id">{node.id}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-16 text-gray-500">{t('detail.weight')}</dt>
          <dd className="font-mono">{node.weight}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-16 text-gray-500">{t('detail.status')}</dt>
          <dd className={node.status ? 'text-green-700' : 'text-yellow-700'}>
            {node.status ? t('detail.completed') : t('detail.uncompleted')}
          </dd>
        </div>
      </dl>

      {error !== null && <div className="mt-2 text-xs text-red-700">{t('detail.error', { message: error })}</div>}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => run(() => client.setCompleted(node.id, !node.status))}
          data-testid="detail-complete"
          className="rounded bg-green-600 px-2 py-2 text-white hover:bg-green-700 md:py-1"
        >
          {node.status ? t('detail.uncomplete') : t('detail.complete')}
        </button>
        <button
          type="button"
          onClick={onRemove}
          data-testid="detail-remove"
          className="rounded bg-red-600 px-2 py-2 text-white hover:bg-red-700 md:py-1"
        >
          {t('detail.remove')}
        </button>
      </div>

      <div className="mt-4 space-y-3 border-t border-gray-200 pt-3">
        <div>
          <label className="text-xs text-gray-600">{t('detail.rename')}</label>
          <div className="mt-1 flex flex-wrap gap-2">
            <input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSubmitRename();
              }}
              data-testid="detail-rename-input"
              className="w-full rounded border border-gray-300 px-2 py-1 sm:w-auto sm:flex-1"
            />
            <button
              type="button"
              onClick={onSubmitRename}
              data-testid="detail-rename-apply"
              className="rounded bg-blue-600 px-2 py-2 text-white hover:bg-blue-700 md:py-1"
            >
              {t('detail.apply')}
            </button>
          </div>
        </div>

        <div>
          <label className="text-xs text-gray-600">{t('detail.addChild')}</label>
          <div className="mt-1 flex flex-wrap gap-2">
            <input
              value={childName}
              onChange={(e) => setChildName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSubmitAddChild();
              }}
              placeholder={t('detail.name')}
              data-testid="detail-child-name"
              className="w-full rounded border border-gray-300 px-2 py-1 sm:w-auto sm:flex-1"
            />
            <input
              value={childWeight}
              onChange={(e) => setChildWeight(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSubmitAddChild();
              }}
              placeholder={t('detail.newWeight')}
              data-testid="detail-child-weight"
              className="w-24 rounded border border-gray-300 px-2 py-1 sm:w-28"
            />
            <button
              type="button"
              onClick={onSubmitAddChild}
              data-testid="detail-child-apply"
              className="rounded bg-blue-600 px-2 py-2 text-white hover:bg-blue-700 md:py-1"
            >
              {t('detail.apply')}
            </button>
          </div>
        </div>

        <div>
          <label className="text-xs text-gray-600">{t('detail.moveTo')}</label>
          <div className="mt-1 flex flex-wrap gap-2">
            {parentSelect(moveTarget, setMoveTarget, moveOptions)}
            <input
              value={moveWeight}
              onChange={(e) => setMoveWeight(e.target.value)}
              placeholder={t('detail.newWeight')}
              className="w-24 rounded border border-gray-300 px-2 py-1 sm:w-28"
            />
            <button
              type="button"
              onClick={onSubmitMove}
              className="rounded bg-blue-600 px-2 py-2 text-white hover:bg-blue-700 md:py-1"
            >
              {t('detail.apply')}
            </button>
          </div>
        </div>

        <div>
          <label className="text-xs text-gray-600">{t('detail.copyTo')}</label>
          <div className="mt-1 flex flex-wrap gap-2">
            {parentSelect(copyTarget, setCopyTarget, flat)}
            <input
              value={copyWeight}
              onChange={(e) => setCopyWeight(e.target.value)}
              placeholder={t('detail.newWeight')}
              className="w-24 rounded border border-gray-300 px-2 py-1 sm:w-28"
            />
            <button
              type="button"
              onClick={onSubmitCopy}
              className="rounded bg-blue-600 px-2 py-2 text-white hover:bg-blue-700 md:py-1"
            >
              {t('detail.apply')}
            </button>
          </div>
          <p className="mt-1 text-xs text-gray-500">{t('detail.copyNote')}</p>
        </div>
      </div>

      <div className="mt-4 border-t border-gray-200 pt-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600">
          {t('detail.reminders')}
        </h3>
        {reminders.length === 0 && <p className="mt-1 text-xs text-gray-500">{t('detail.noReminders')}</p>}
        <ul className="mt-2 space-y-2">
          {reminders.map((r) => (
            <ReminderRow
              key={r.id}
              reminder={r}
              client={client}
              editing={editingRmdId === r.id}
              onStartEdit={() => setEditingRmdId(r.id)}
              onCancelEdit={() => setEditingRmdId(null)}
              onError={setError}
            />
          ))}
        </ul>
        {editingRmdId === null && (
          <ReminderForm
            client={client}
            nodeId={node.id}
            onDone={() => setError(null)}
            onError={setError}
          />
        )}
      </div>
    </div>
  );
}

/** The workspace root: only adding top-level nodes makes sense here. */
function RootPanel({
  client,
  onClose,
  bare,
}: {
  client: WorktreeClient;
  onClose: () => void;
  bare?: boolean;
}) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [weight, setWeight] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (): void => {
    const trimmed = name.trim();
    if (trimmed === '') return;
    try {
      client.addNode(ROOT_ID, trimmed, parseOptionalWeight(weight));
      setName('');
      setWeight('');
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    }
  };

  return (
    <div
      data-detail
      className={`${bare === true ? '' : 'rounded border border-gray-300 bg-white '}p-4 text-sm`}
    >
      <div
        className={`flex items-start justify-between ${
          bare === true ? 'sticky top-0 z-10 -mx-4 mb-1 bg-white px-4 py-1' : ''
        }`}
      >
        <h2 className="font-semibold">{t('detail.rootTitle')}</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded px-3 py-1.5 text-gray-500 hover:bg-gray-100 md:px-2 md:py-0.5"
        >
          ✕
        </button>
      </div>
      <div className="mt-3">
        <label className="text-xs text-gray-600">{t('detail.addChild')}</label>
        <div className="mt-1 flex flex-wrap gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
            placeholder={t('detail.name')}
            data-testid="detail-child-name"
            className="w-full rounded border border-gray-300 px-2 py-1 sm:w-auto sm:flex-1"
          />
          <input
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
            placeholder={t('detail.newWeight')}
            data-testid="detail-child-weight"
            className="w-24 rounded border border-gray-300 px-2 py-1 sm:w-28"
          />
          <button
            type="button"
            onClick={submit}
            data-testid="detail-child-apply"
            className="rounded bg-blue-600 px-2 py-2 text-white hover:bg-blue-700 md:py-1"
          >
            {t('detail.apply')}
          </button>
        </div>
        {error !== null && (
          <div className="mt-1 text-xs text-red-700">{t('detail.error', { message: error })}</div>
        )}
      </div>
    </div>
  );
}

function ReminderRow(props: {
  reminder: Reminder;
  client: WorktreeClient;
  editing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onError: (msg: string | null) => void;
}) {
  const { t } = useI18n();
  const { reminder, client, editing, onStartEdit, onCancelEdit, onError } = props;

  const run = (fn: () => void): void => {
    try {
      fn();
      onError(null);
    } catch (e) {
      onError(errMsg(e));
    }
  };

  if (editing) {
    return (
      <ReminderForm
        client={client}
        nodeId=""
        reminder={reminder}
        onDone={onCancelEdit}
        onError={onError}
      />
    );
  }

  return (
    <li className="flex items-center gap-2 text-xs">
      <input
        type="checkbox"
        checked={reminder.active}
        onChange={(e) => run(() => client.editReminder(reminder.id, { active: e.target.checked }))}
        title={t('detail.active')}
      />
      <span className={`min-w-0 flex-1 break-all font-mono ${reminder.active ? '' : 'text-gray-400'}`}>
        {formatReminder(reminder)}
      </span>
      <button
        type="button"
        onClick={onStartEdit}
        className="rounded px-2 py-1.5 text-blue-700 hover:bg-blue-50 md:px-1.5 md:py-0.5"
      >
        {t('detail.edit')}
      </button>
      <button
        type="button"
        onClick={() => run(() => client.removeReminder(reminder.id))}
        className="rounded px-2 py-1.5 text-red-700 hover:bg-red-50 md:px-1.5 md:py-0.5"
      >
        {t('detail.delete')}
      </button>
    </li>
  );
}

function ReminderForm(props: {
  client: WorktreeClient;
  /** Node for a new reminder; empty when editing an existing one. */
  nodeId: string;
  reminder?: Reminder;
  onDone: () => void;
  onError: (msg: string | null) => void;
}) {
  const { t } = useI18n();
  const { client, nodeId, reminder, onDone, onError } = props;
  const isEdit = reminder !== undefined;

  const [name, setName] = useState(reminder?.name ?? '');
  const [deadline, setDeadline] = useState(
    reminder !== undefined ? epochToLocalInput(reminder.deadline) : epochToLocalInput(Date.now()),
  );
  const [repeat, setRepeat] = useState(reminder?.repeat !== undefined ? String(reminder.repeat) : '');
  const [active, setActive] = useState(reminder?.active ?? true);
  const [preset, setPreset] = useState('none');
  const [error, setError] = useState<string | null>(null);

  const submit = (): void => {
    const deadlineMs = localInputToEpoch(deadline);
    if (deadlineMs === null) {
      setError('invalid deadline');
      return;
    }
    const nameValue = name.trim();
    if (nameValue === '') {
      setError('reminder name must not be empty');
      return;
    }
    try {
      if (isEdit) {
        client.editReminder(reminder.id, {
          name: nameValue,
          deadline: deadlineMs,
          repeat: repeat.trim() === '' ? null : Number(repeat),
          active,
        });
      } else {
        client.addReminder(
          nodeId,
          nameValue,
          deadlineMs,
          repeat.trim() === '' ? undefined : Number(repeat),
        );
      }
      onError(null);
      onDone();
    } catch (e) {
      setError(errMsg(e));
    }
  };

  const onPreset = (value: string): void => {
    const p = REPEAT_PRESETS.find((r) => r.key === value);
    setPreset(value);
    setRepeat(p?.ms === null || p === undefined ? '' : String(p.ms));
  };

  return (
    <div className="rounded border border-blue-200 bg-blue-50 p-2 text-xs">
      <div className="flex flex-col gap-1.5">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('detail.reminderName')}
          data-testid="reminder-name"
          className="rounded border border-gray-300 px-2 py-1"
        />
        <input
          type="datetime-local"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
          data-testid="reminder-deadline"
          className="rounded border border-gray-300 px-2 py-1"
        />
        <div className="flex gap-2">
          <input
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
            placeholder={t('detail.repeatMs')}
            data-testid="reminder-repeat"
            className="w-full rounded border border-gray-300 px-2 py-1"
          />
          <select
            value={preset}
            onChange={(e) => onPreset(e.target.value)}
            className="rounded border border-gray-300 px-1 py-1"
          >
            {REPEAT_PRESETS.map((p) => (
              <option key={p.key} value={p.key}>
                {t(p.key)}
              </option>
            ))}
          </select>
        </div>
        {isEdit && (
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            {t('detail.active')}
          </label>
        )}
        {error !== null && <div className="text-red-700">{error}</div>}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={submit}
            data-testid="reminder-save"
            className="rounded bg-blue-600 px-2 py-2 text-white hover:bg-blue-700 md:py-1"
          >
            {t('detail.save')}
          </button>
          <button
            type="button"
            onClick={onDone}
            className="rounded border border-gray-300 bg-white px-2 py-2 hover:bg-gray-50 md:py-1"
          >
            {t('detail.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
