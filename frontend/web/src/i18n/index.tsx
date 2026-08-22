import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { messages } from './messages';
import type { StringMap } from './messages';

export type Translate = (key: string, params?: Record<string, string | number>) => string;

const I18nContext = createContext<{ t: Translate; lang: string }>({
  t: (key) => key,
  lang: 'en',
});

function lookup(map: StringMap | undefined, key: string): string | undefined {
  if (map === undefined) return undefined;
  const parts = key.split('.');
  let node: StringMap | string = map;
  for (const part of parts) {
    if (typeof node === 'string') return undefined;
    node = node[part];
  }
  return typeof node === 'string' ? node : undefined;
}

function translate(lang: string, key: string, params?: Record<string, string | number>): string {
  let text = lookup(messages[lang], key) ?? lookup(messages.en, key) ?? key;
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.replaceAll(`{${name}}`, String(value));
    }
  }
  return text;
}

export function I18nProvider({ lang, children }: { lang: string; children: ReactNode }) {
  const t: Translate = (key, params) => translate(lang, key, params);
  return <I18nContext.Provider value={{ t, lang }}>{children}</I18nContext.Provider>;
}

export function useI18n(): { t: Translate; lang: string } {
  return useContext(I18nContext);
}
