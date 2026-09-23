import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { I18nProvider, LANGS } from '../src/i18n';
import { messages } from '../src/i18n/messages';
import type { StringMap } from '../src/i18n/messages';

function leafPaths(node: StringMap, prefix = ''): string[] {
  const paths: string[] = [];
  for (const [key, value] of Object.entries(node)) {
    const path = prefix === '' ? key : `${prefix}.${key}`;
    if (typeof value === 'string') paths.push(path);
    else paths.push(...leafPaths(value, path));
  }
  return paths;
}

function leafAt(node: StringMap, path: string): string | undefined {
  let current: StringMap | string = node;
  for (const part of path.split('.')) {
    if (typeof current === 'string') return undefined;
    const next: string | StringMap | undefined = current[part];
    if (next === undefined) return undefined;
    current = next;
  }
  return typeof current === 'string' ? current : undefined;
}

function placeholders(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
}

/** Values that are intentionally identical in every catalogue. */
const LOCALE_NEUTRAL = ['app.title', 'detail.noDeadline', 'language.en', 'language.zh'];

const ENGLISH = leafPaths(messages.en).sort();

describe('i18n catalogues', () => {
  it('every catalogue has exactly the English key set', () => {
    for (const code of LANGS) {
      expect(leafPaths(messages[code]).sort(), code).toEqual(ENGLISH);
    }
  });

  it('every catalogue keeps the English placeholders', () => {
    for (const code of LANGS) {
      for (const path of ENGLISH) {
        const translated = leafAt(messages[code], path);
        expect(translated, `${code}:${path}`).toBeDefined();
        expect(placeholders(translated ?? ''), `${code}:${path}`).toEqual(
          placeholders(leafAt(messages.en, path) ?? ''),
        );
      }
    }
  });

  it('every catalogue translates every key it could have copied', () => {
    for (const code of LANGS) {
      if (code === 'en') continue;
      for (const path of ENGLISH) {
        if (LOCALE_NEUTRAL.includes(path)) continue;
        expect(leafAt(messages[code], path), `${code}:${path}`).not.toBe(leafAt(messages.en, path));
      }
    }
  });

  it('every language names itself, for the Settings select', () => {
    for (const code of LANGS) {
      expect(leafAt(messages[code], `language.${code}`), code).toBeTruthy();
    }
  });

  it('the provider mirrors the language onto the document element', () => {
    render(
      <I18nProvider lang="zh">
        <span>content</span>
      </I18nProvider>,
    );
    expect(document.documentElement.lang).toBe('zh');
  });
});
