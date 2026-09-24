// Ordered-list numbering styles — single source of truth for orderedList.ts (the
// `listStyleType` attr), Toolbar.svelte, editor.css, and export/odt.ts. `decimal`
// is the default and maps to odf-kit's own output, so the export rewrite skips it.

export type OrderedListType =
  | 'decimal'      | 'decimal-paren'
  | 'lower-alpha'  | 'lower-alpha-paren'
  | 'upper-alpha'  | 'upper-alpha-paren'
  | 'lower-roman'  | 'lower-roman-paren'
  | 'upper-roman'  | 'upper-roman-paren'
  | 'cjk-counting' | 'cjk-legal' | 'cjk-stem' | 'circled-decimal'
  | 'multilevel';

export const DEFAULT_ORDERED_TYPE: OrderedListType = 'decimal';

// Numbering when the attr is null, keyed by 0-based nesting depth (Word's default
// multilevel template: 1. → a. → i., repeating).
export const DEFAULT_ORDERED_CYCLE: OrderedListType[] = ['decimal', 'lower-alpha', 'lower-roman'];

export function defaultOrderedType(depth0: number): OrderedListType {
  return DEFAULT_ORDERED_CYCLE[depth0 % DEFAULT_ORDERED_CYCLE.length];
}

// The four ODF spellings LibreOffice writes for CJK numbering, verbatim.
export type CjkNumFormat = '一, 二, 三, ...' | '壹, 贰, 叁, ...' | '甲, 乙, 丙, ...' | '①, ②, ③, ...';

export interface OrderedTypeDef {
  key: OrderedListType;
  label: string;   // human-readable description for the menu
  preview: string; // a single marker shown in the dropdown, e.g. "1." or "a)"
  // ODF style:num-format. LibreOffice spells the CJK formats as the whole sequence,
  // not as one character — probed, it drops a bare '一' back to decimal.
  numFormat: '1' | 'a' | 'A' | 'i' | 'I' | CjkNumFormat;
  numSuffix: '.' | ')' | '、' | ''; // ODF style:num-suffix
  // Legal/outline numbering (1., 1.1., 1.2.1. …): each level shows the parent chain.
  // ODF text:display-levels, DOCX "%1.%2." lvlText, CSS counters() markers.
  multilevel?: boolean;
}

// In menu order. Keep aligned with the @counter-style / ol[data-list-style] rules
// in editor.css.
export const ORDERED_LIST_TYPES: OrderedTypeDef[] = [
  { key: 'decimal',           label: '1, 2, 3',        preview: '1.',   numFormat: '1', numSuffix: '.' },
  { key: 'decimal-paren',     label: '1), 2), 3)',     preview: '1)',   numFormat: '1', numSuffix: ')' },
  { key: 'multilevel',        label: '1, 1.1, 1.2.1',  preview: '1.1.', numFormat: '1', numSuffix: '.', multilevel: true },
  { key: 'lower-alpha',       label: 'a, b, c',        preview: 'a.',   numFormat: 'a', numSuffix: '.' },
  { key: 'lower-alpha-paren', label: 'a), b), c)',     preview: 'a)',   numFormat: 'a', numSuffix: ')' },
  { key: 'upper-alpha',       label: 'A, B, C',        preview: 'A.',   numFormat: 'A', numSuffix: '.' },
  { key: 'upper-alpha-paren', label: 'A), B), C)',     preview: 'A)',   numFormat: 'A', numSuffix: ')' },
  { key: 'lower-roman',       label: 'i, ii, iii',     preview: 'i.',   numFormat: 'i', numSuffix: '.' },
  { key: 'lower-roman-paren', label: 'i), ii), iii)',  preview: 'i)',   numFormat: 'i', numSuffix: ')' },
  { key: 'upper-roman',       label: 'I, II, III',     preview: 'I.',   numFormat: 'I', numSuffix: '.' },
  { key: 'upper-roman-paren', label: 'I), II), III)',  preview: 'I)',   numFormat: 'I', numSuffix: ')' },
  { key: 'cjk-counting',      label: '一, 二, 三',      preview: '一、',  numFormat: '一, 二, 三, ...', numSuffix: '、' },
  { key: 'cjk-legal',         label: '壹, 贰, 叁',      preview: '壹、',  numFormat: '壹, 贰, 叁, ...', numSuffix: '、' },
  { key: 'cjk-stem',          label: '甲, 乙, 丙',      preview: '甲、',  numFormat: '甲, 乙, 丙, ...', numSuffix: '、' },
  { key: 'circled-decimal',   label: '①, ②, ③',      preview: '①',    numFormat: '①, ②, ③, ...', numSuffix: '' },
];

const BY_KEY = new Map<string, OrderedTypeDef>(ORDERED_LIST_TYPES.map(t => [t.key, t]));

export function orderedTypeDef(key: string | null | undefined): OrderedTypeDef {
  return BY_KEY.get(key ?? DEFAULT_ORDERED_TYPE) ?? BY_KEY.get(DEFAULT_ORDERED_TYPE)!;
}

// The def a list with this attr renders at this 0-based depth (null = depth cycle).
export function effectiveOrderedDef(key: string | null | undefined, depth0: number): OrderedTypeDef {
  return orderedTypeDef(key ?? defaultOrderedType(depth0));
}

// Attr helper: null when the key equals the depth default, so round trips don't
// accrete explicit attrs. Callers inside a multilevel chain skip this — there the
// chain itself is the default, so an explicit key must stay explicit.
export function orderedTypeAttr(key: OrderedListType, depth0: number): OrderedListType | null {
  return key === defaultOrderedType(depth0) ? null : key;
}

// The cycle slot (0=decimal, 1=alpha, 2=roman) a numbering type renders as, keyed
// by its num-format so paren/upper variants share their base slot. A nested list
// advances one slot past its parent's *effective* type, so it never repeats it.
export function cycleSlotOf(key: string | null | undefined): number {
  switch (orderedTypeDef(key).numFormat) {
    case 'a': case 'A': return 1;
    case 'i': case 'I': return 2;
    default: return 0;
  }
}

// A list's position in the default cycle: its base slot plus the suffix inherited down
// the chain (so "a)" at one level makes deeper defaults keep the ")" suffix).
export type OrderedCycle = { slot: number; suffix: '.' | ')' };
export const ROOT_ORDERED_CYCLE: OrderedCycle = { slot: 0, suffix: '.' };

const DOT_SLOTS: OrderedListType[] = ['decimal', 'lower-alpha', 'lower-roman'];
const PAREN_SLOTS: OrderedListType[] = ['decimal-paren', 'lower-alpha-paren', 'lower-roman-paren'];

// The default numbering at a cycle position: the slot's base form (1./a./i.) carrying
// the inherited suffix, so a level-1 "a)" makes level 2 default to i), not i.
export function defaultOrderedTypeAt(cycle: OrderedCycle): OrderedListType {
  return (cycle.suffix === ')' ? PAREN_SLOTS : DOT_SLOTS)[cycle.slot % DOT_SLOTS.length];
}

// Cycle position of a list nested under a parent: advance one slot; an explicit ordered
// parent re-anchors both slot and suffix to its own, so a level-1 "a., b." makes level 2
// default to i. and a level-1 "a)" makes it i) — others pass the context through.
export function childCycle(parent: OrderedCycle, parentKey: string | null | undefined, parentOrdered: boolean): OrderedCycle {
  if (parentOrdered && parentKey && parentKey !== 'multilevel') {
    // The cycle only knows the two western suffixes; a CJK parent hands its children
    // the default one rather than its own 、.
    const suffix = orderedTypeDef(parentKey).numSuffix;
    return { slot: cycleSlotOf(parentKey) + 1, suffix: suffix === ')' ? ')' : '.' };
  }
  return { slot: parent.slot + 1, suffix: parent.suffix };
}

// Cycle-aware variants of orderedTypeAttr/effectiveOrderedDef (null = matches the
// cycle default, so round trips don't accrete explicit attrs).
export function orderedTypeAttrAt(key: OrderedListType, cycle: OrderedCycle): OrderedListType | null {
  return key === defaultOrderedTypeAt(cycle) ? null : key;
}

export function effectiveOrderedDefAt(key: string | null | undefined, cycle: OrderedCycle): OrderedTypeDef {
  return orderedTypeDef(key ?? defaultOrderedTypeAt(cycle));
}

function toRoman(n: number): string {
  const map: [number, string][] = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];
  let s = '';
  for (const [v, sym] of map) while (n >= v) { s += sym; n -= v; }
  return s;
}

function toAlpha(n: number): string {
  let s = '';
  while (n > 0) { n--; s = String.fromCharCode(97 + (n % 26)) + s; n = Math.floor(n / 26); }
  return s;
}

// Chinese numerals, informal (一二三) or formal (壹贰叁). Probed against LibreOffice: the
// informal set drops the leading 一 in 十…十九, the formal one keeps it (壹拾壹).
function toChinese(n: number, formal: boolean): string {
  if (n < 1 || n > 9999) return String(n);
  const d = formal ? '零壹贰叁肆伍陆柒捌玖' : '〇一二三四五六七八九';
  const u = formal ? ['', '拾', '佰', '仟'] : ['', '十', '百', '千'];
  const digits = [...String(n)].map(Number);
  let out = '';
  let gap = false;
  digits.forEach((digit, i) => {
    const unit = digits.length - 1 - i;
    if (digit === 0) { gap = true; return; }
    if (gap && out) out += d[0];
    gap = false;
    if (!(!formal && digit === 1 && unit === 1 && i === 0)) out += d[digit];
    out += u[unit];
  });
  return out;
}

// The ten heavenly stems; past them LibreOffice numbers on in decimal (probed).
const HEAVENLY_STEMS = [...'甲乙丙丁戊己庚辛壬癸'];

// ①–⑳, ㉑–㉟, ㊱–㊿ — three separate Unicode runs, decimal past the last.
function toCircled(n: number): string {
  if (n >= 1 && n <= 20) return String.fromCodePoint(0x2460 + n - 1);
  if (n <= 35) return String.fromCodePoint(0x3251 + n - 21);
  if (n <= 50) return String.fromCodePoint(0x32b1 + n - 36);
  return String(n);
}

// The ordinal body an item renders for a num-format (no suffix): 3/'a' → "c".
export function formatOrdinal(n: number, numFormat: OrderedTypeDef['numFormat']): string {
  switch (numFormat) {
    case 'a': return toAlpha(n);
    case 'A': return toAlpha(n).toUpperCase();
    case 'i': return toRoman(n);
    case 'I': return toRoman(n).toUpperCase();
    case '一, 二, 三, ...': return toChinese(n, false);
    case '壹, 贰, 叁, ...': return toChinese(n, true);
    case '甲, 乙, 丙, ...': return HEAVENLY_STEMS[n - 1] ?? String(n);
    case '①, ②, ③, ...': return toCircled(n);
    default: return String(n);
  }
}

// Reverse lookup for the ODT importer: ODF numbering attrs → listStyleType key.
// Unknown formats (e.g. figure numbering) fall back to decimal.
export function orderedTypeFromFormat(numFormat: string | null, numSuffix: string | null): OrderedListType {
  const byFormat = ORDERED_LIST_TYPES.filter(t => !t.multilevel && t.numFormat === numFormat);
  // Each CJK format has exactly one entry, so its own suffix stands whatever the file
  // writes around the marker; the western ones come in a dot and a paren variant.
  if (byFormat.length === 1) return byFormat[0].key;
  return byFormat.find(t => t.numSuffix === (numSuffix ?? '.'))?.key ?? DEFAULT_ORDERED_TYPE;
}
