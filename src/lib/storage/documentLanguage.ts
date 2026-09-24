// The document's spell-check language. One value per document, persisted to
// localStorage and round-tripped through the .odt (fo:language/fo:country on
// the default paragraph style). 'none' disables checking.

import { resolveBrowserLocale } from '../i18n/config';
import { docKey } from './docScope';

export const NO_LANGUAGE = 'none';

export type DocumentLanguage = string;

export interface LanguageDef {
  code: string;
  label: string;
  // Dictionary assets live at public/dictionaries/<code>/<code>.{aff,dic}.
  odf: { language: string; country: string };
  // harper.js, the grammar engine, only knows English.
  grammar?: true;
  // A language the document can be in without a bundled dictionary: the picker offers
  // it so the file names its language, spell-checking simply stays off.
  noDict?: true;
}

// The languages a document can be in. Most carry a bundled Hunspell dictionary — add one
// by dropping a folder in public/dictionaries/<code>/ and appending an entry here; a
// `noDict` entry names its language for the file without checking it. A code has to be a valid
// BCP-47 tag: it reaches Intl as the number locale, which throws on anything else.
export const LANGUAGES: LanguageDef[] = [
  { code: 'en', label: 'English (US)', odf: { language: 'en', country: 'US' }, grammar: true },
  { code: 'en-GB', label: 'English (UK)', odf: { language: 'en', country: 'GB' }, grammar: true },
  { code: 'de', label: 'Deutsch', odf: { language: 'de', country: 'DE' } },
  { code: 'es', label: 'Español (España)', odf: { language: 'es', country: 'ES' } },
  { code: 'fr', label: 'Français', odf: { language: 'fr', country: 'FR' } },
  { code: 'pt', label: 'Português (Portugal)', odf: { language: 'pt', country: 'PT' } },
  { code: 'ru', label: 'Русский', odf: { language: 'ru', country: 'RU' } },
  { code: 'zh-CN', label: '中文（简体）', odf: { language: 'zh', country: 'CN' }, noDict: true },
  { code: 'zh-TW', label: '中文（繁體）', odf: { language: 'zh', country: 'TW' }, noDict: true },
];

const KEY = docKey('edentext-doc-language');

export function findLanguage(code: DocumentLanguage): LanguageDef | undefined {
  return LANGUAGES.find((l) => l.code === code);
}

export function hasGrammar(code: DocumentLanguage): boolean {
  return findLanguage(code)?.grammar === true;
}

// True where the language is known but has no bundled dictionary, so nothing is fetched
// and no importer warns about a dictionary it was never going to find.
export function hasDictionary(code: DocumentLanguage): boolean {
  const def = findLanguage(code);
  return !!def && def.noDict !== true;
}

// East Asian text: both formats keep its language in their own asian slot, and both word
// processors read it only from there. The complex slot (Hebrew, Arabic) is separate.
export function isAsianTag(tag: string): boolean {
  return /^(zh|ja|ko)\b/i.test(tag.trim());
}

function isValid(code: string): boolean {
  return code === NO_LANGUAGE || !!findLanguage(code);
}

// First run follows the browser language, by full tag first so en-GB picks the British
// dictionary rather than the US one; resolveBrowserLocale covers the rest. A tag no entry
// claims leaves checking off rather than guessing.
export function loadDocumentLanguage(): DocumentLanguage {
  const code = localStorage.getItem(KEY);
  if (code && isValid(code)) return code;
  const fromTag = codeForTag(navigator.language ?? '');
  if (fromTag) return fromTag;
  const ui = resolveBrowserLocale();
  return isValid(ui) ? ui : NO_LANGUAGE;
}

export function saveDocumentLanguage(code: DocumentLanguage): void {
  localStorage.setItem(KEY, code);
}

// → ODF fo:language/fo:country for export; null when checking is off.
export function odfFromLanguage(code: DocumentLanguage): { language: string; country: string } | null {
  return findLanguage(code)?.odf ?? null;
}

// A full language tag ('en-US', 'fr-FR') ↔ ODF's split fo:language/fo:country. The tag is
// what a paragraph and a run carry, so a document in a language we have no dictionary for
// still saves the one it came with.
export function odfFromTag(tag: string): { language: string; country: string } | null {
  const m = /^([A-Za-z]{2,3})(?:[-_]([A-Za-z]{2}|\d{3}))?$/.exec(tag.trim());
  return m ? { language: m[1].toLowerCase(), country: (m[2] ?? '').toUpperCase() } : null;
}

export function tagFromOdf(language: string, country?: string): string {
  const lang = language.toLowerCase();
  return country ? `${lang}-${country.toUpperCase()}` : lang;
}

// The dictionary code a language tag maps onto, null where we have no dictionary for it.
export function codeForTag(tag: string): DocumentLanguage | null {
  const odf = odfFromTag(tag);
  return odf ? languageFromOdf(odf.language, odf.country) : null;
}

// The tag a dictionary code stands for, for the language picker's own entries.
export function tagForLanguage(code: DocumentLanguage): string | null {
  const odf = odfFromLanguage(code);
  return odf ? tagFromOdf(odf.language, odf.country) : null;
}

// ODF fo:language(/country) → a known code, else null (caller maps to 'none').
// Matches on language first, preferring an exact country match when present.
export function languageFromOdf(language: string, country?: string): DocumentLanguage | null {
  const lang = language.toLowerCase();
  const ctry = country?.toUpperCase();
  const byLang = LANGUAGES.filter((l) => l.odf.language.toLowerCase() === lang);
  if (!byLang.length) return null;
  if (ctry) {
    const exact = byLang.find((l) => l.odf.country.toUpperCase() === ctry);
    if (exact) return exact.code;
  }
  return byLang[0].code;
}
