import { useEffect, useRef, useState } from 'react';
import type { WorktreeClient } from '@worktree/client';
import { useI18n } from '../i18n';

/**
 * The capture overlay (⌘K/Ctrl+K, a ?quick=1 link or the Android share
 * target): the text becomes a node under the configured capture path, the
 * first line as its name and the rest as its note. Enter captures; an empty
 * Enter captures the clipboard instead (Shift+Enter inserts a line break,
 * Esc closes).
 */
export function QuickCapture(props: {
  client: WorktreeClient;
  /** The configured capture path (AppConfig.quickAddPath). */
  path: string;
  /** Prefilled text from a link; '' when the overlay was opened empty. */
  initialText: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const { client, path, initialText, onClose } = props;
  const [text, setText] = useState(initialText);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [captured, setCaptured] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Success shows briefly, then the overlay closes itself.
  useEffect(() => {
    if (captured === null) return;
    const timer = setTimeout(onClose, 1000);
    return () => clearTimeout(timer);
  }, [captured, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async (): Promise<void> => {
    if (busy || captured !== null) return;
    let value = text;
    if (value.trim() === '') {
      // An empty Enter captures the clipboard; a denial surfaces, never falls through.
      try {
        value = await navigator.clipboard.readText();
      } catch (e) {
        setError(`${t('capture.clipboardFailed')} ${e instanceof Error ? e.message : String(e)}`);
        return;
      }
      if (value.trim() === '') {
        setError(t('capture.empty'));
        return;
      }
    }
    setError(null);
    setBusy(true);
    try {
      setCaptured(client.quickAdd(value, { path }).displayPath);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      data-testid="quick-capture"
      className="fixed inset-0 z-30 flex items-start justify-center bg-black/30 p-4 pt-24"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-lg border border-gray-300 bg-white p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <textarea
          ref={inputRef}
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void submit();
            }
          }}
          placeholder={t('capture.placeholder', { path })}
          data-testid="quick-capture-input"
          className="w-full resize-none rounded border border-gray-300 px-3 py-2"
        />
        {captured !== null ? (
          <p data-testid="quick-capture-done" className="mt-2 text-sm text-green-700">
            {t('capture.added', { path: captured })}
          </p>
        ) : (
          <p className="mt-2 text-xs text-gray-500">{t('capture.hint')}</p>
        )}
        {error !== null && (
          <p data-testid="quick-capture-error" className="mt-2 text-sm text-red-700">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
