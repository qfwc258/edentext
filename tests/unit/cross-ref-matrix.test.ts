// The matrix a hand-found bug always turns out to be a cell of: every target type the
// window offers, every format it offers for that type, in every container a target can
// sit in. Each cell inserts the reference the way the window does and asks the same
// three things — a target is found, the field caches what it will show (never the bare
// `_Ref` name it points at), and the target is reachable again — then the whole
// document goes through both formats once.
import { describe, it, expect } from 'vitest';
import { Editor, getSchema } from '@tiptap/core';
import { Node as PMNode } from '@tiptap/pm/model';
import { extensions } from '../../src/lib/editor/extensions';
import {
  REF_TARGET_KINDS, refTargets, refFormats, refRange, numberAt,
  noteTargets, type CrossRefFormat, type RefTargetKind,
} from '../../src/lib/editor/extensions/crossReference';
import { bookmarks, findTarget, sanitizeBookmarkName } from '../../src/lib/editor/extensions/bookmark';
import { headingNumbers } from '../../src/lib/editor/extensions/outline';
import { builtinStyleSheet } from '../../src/lib/styles/styleSheet';
import { DEFAULT_NOTE_SETTINGS } from '../../src/lib/storage/noteSettings';
import { DEFAULT_OUTLINE_LEVEL } from '../../src/lib/styles/outlineNumbering';
import { DEFAULT_MARGINS } from '../../src/lib/storage/pageMargins';
import { buildOdt } from '../../src/lib/export/odt';
import { buildDocx } from '../../src/lib/export/docx';
import { importOdt } from '../../src/lib/import/odt';
import { importDocx } from '../../src/lib/import/docx';

type N = any;

// jsdom has none; the text box's node view observes its own size.
(globalThis as any).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };

const SHEET = builtinStyleSheet();
const SCHEMA = getSchema(extensions);
const T = (text: string, ...marks: N[]): N => ({ type: 'text', text, ...(marks.length ? { marks } : {}) });
const P = (...content: N[]): N => ({ type: 'paragraph', content });
const bm = (name: string) => ({ type: 'bookmark', attrs: { name } });
const seq = (category: string) => ({ type: 'sequenceField', attrs: { category, format: '1', number: 1 } });
const anchor = (id: string, kind: string, text: string) => ({ type: 'noteRef', attrs: { id, kind, text } });

// Where a target can sit. A note's own text takes inline content only, so it carries the
// two inline targets and gets a case of its own below.
const CONTAINERS = ['body', 'cell', 'box'] as const;
type Container = (typeof CONTAINERS)[number];

// Which types each container offers, and why it offers no more: `refTargets` skips a
// heading inside a cell (neither product numbers one), and a note in a text box is what
// the editor's own command refuses — neither file keeps one there.
const OFFERED: Record<Container, RefTargetKind[]> = {
  body: ['heading', 'numbered', 'bookmark', 'figure', 'table', 'footnote', 'endnote'],
  cell: ['numbered', 'bookmark', 'figure', 'table', 'footnote', 'endnote'],
  box: ['heading', 'numbered', 'bookmark', 'figure', 'table'],
};

function targetBlocks(tag: Container): N[] {
  const blocks: N[] = [];
  if (tag !== 'cell') blocks.push({ type: 'heading', attrs: { level: 1 }, content: [T(`Chapter ${tag}`)] });
  blocks.push(
    { type: 'orderedList', content: [{ type: 'listItem', content: [P(T(`Item ${tag}`))] }] },
    P(T(`Marked ${tag}`, bm(`mark_${tag}`))),
    P(T('Figure '), seq('figure'), T(`: a picture ${tag}`)),
    P(T('Table '), seq('table'), T(`: a grid ${tag}`)),
  );
  if (tag !== 'box') blocks.push(P(T('Anchor'), anchor('fa', 'footnote', '1'), anchor('ea', 'endnote', 'i')));
  return blocks;
}

function docFor(tag: Container): N {
  const blocks = targetBlocks(tag);
  const body = tag === 'body' ? blocks
    : tag === 'cell'
      ? [{ type: 'table',
          content: [{ type: 'tableRow',
            content: [{ type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: blocks }] }] }]
      : [P({ type: 'textBox', attrs: { width: 240, height: 240 }, content: blocks })];
  const content: N[] = [...body, P(T('Refs:'))];
  if (tag !== 'box') {
    content.push({ type: 'noteSection', content: [
      { type: 'note', attrs: { id: 'fa', kind: 'footnote', label: null, text: '1' }, content: [T('The footnote.')] },
      { type: 'note', attrs: { id: 'ea', kind: 'endnote', label: null, text: 'i' }, content: [T('The endnote.')] },
    ] });
  }
  return { type: 'doc', content };
}

function makeEditor(content: N): Editor {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return new Editor({ element: el, extensions, content });
}

// The paragraph every reference is inserted into: it grows, and everything a reference
// points at lies before it, so no target moves while the matrix is filled in.
function sinkEnd(doc: PMNode): number {
  let at = -1;
  doc.descendants((node, pos) => {
    if (node.type.name === 'paragraph' && node.textContent.startsWith('Refs:')) at = pos + node.nodeSize - 1;
    return true;
  });
  return at;
}

const refsOf = (doc: PMNode): PMNode[] => {
  const out: PMNode[] = [];
  doc.descendants((node) => {
    if (node.type.name === 'crossRef') out.push(node);
    return true;
  });
  return out;
};

const walk = (node: N, type: string, out: N[] = []): N[] => {
  if (node.type === type) out.push(node);
  for (const c of node.content ?? []) walk(c, type, out);
  return out;
};

// What the field has to show the moment it is inserted, where the format decides it
// exactly: a caption is the one target the formats cut into pieces.
function expected(kind: RefTargetKind, format: CrossRefFormat, tag: Container): string | null {
  if (format === 'page') return '1';
  if (kind === 'figure' || kind === 'table') {
    const category = kind === 'figure' ? 'Figure' : 'Table';
    const text = kind === 'figure' ? `a picture ${tag}` : `a grid ${tag}`;
    if (format === 'value') return '1';
    if (format === 'category-and-value') return `${category} 1`;
    if (format === 'caption') return text;
    return `${category} 1: ${text}`;
  }
  if (kind === 'footnote') return '1';
  if (kind === 'endnote') return 'i';
  // A number is recounted by the field round against the live page; the insert caches
  // the target's text until then, which is all that can be asserted here.
  if (format !== 'text') return null;
  return kind === 'heading' ? `Chapter ${tag}` : kind === 'numbered' ? `Item ${tag}` : `Marked ${tag}`;
}

const spell = (kind: unknown, format: unknown) => `${kind ?? 'bookmark'}/${format}`;

// Word has only bookmarks and only a plain REF: a caption reference is a REF over the
// range the format already cut, so both the sequence field and the caption format it
// asked for are the file's to lose. A note keeps its own NOTEREF.
const asWordSays = (cell: string) =>
  spell(cell.startsWith('sequence/') ? 'bookmark' : cell.split('/')[0],
    /category-and-value|caption|value/.test(cell) ? 'text' : cell.split('/')[1]);

describe.each(CONTAINERS)('every reference type and format, in a %s', (tag) => {
  const editor = makeEditor(docFor(tag));
  // [type, format] of every reference, in the order they are inserted.
  const cells: [RefTargetKind, CrossRefFormat][] = [];

  it('offers exactly the types the container can hold, and inserts every format', () => {
    for (const kind of REF_TARGET_KINDS) {
      const found = refTargets(editor.state.doc, kind, SHEET, DEFAULT_NOTE_SETTINGS);
      if (!OFFERED[tag].includes(kind)) {
        expect(found, `${tag}/${kind}: no target`).toHaveLength(0);
        continue;
      }
      expect(found.length, `${tag}/${kind}: a target`).toBeGreaterThan(0);
      expect(found[0].label.trim(), `${tag}/${kind}: a row to pick`).not.toBe('');

      for (const format of refFormats(kind)) {
        // Read the targets back for each cell, as the window does: an insert mints a
        // bookmark, and the next pick has to see the document that leaves behind.
        const target = refTargets(editor.state.doc, kind, SHEET, DEFAULT_NOTE_SETTINGS)[0];
        const range = refRange(editor.state.doc, target, format);
        editor.commands.setTextSelection(sinkEnd(editor.state.doc));
        editor.commands.insertCrossRef({
          name: target.name, from: range.from, to: range.to, format, kind: target.kind,
        });
        cells.push([kind, format]);
      }
    }

    const refs = refsOf(editor.state.doc);
    expect(refs.map((r) => [r.attrs.format, r.attrs.kind ?? 'bookmark'] as const).length).toBe(cells.length);
    refs.forEach((ref, i) => {
      const [kind, format] = cells[i];
      const where = `${tag}/${kind}/${format}`;
      const shown = String(ref.attrs.text ?? '');
      expect(shown, `${where}: shows something`).not.toBe('');
      expect(shown, `${where}: never the bookmark's own name`).not.toMatch(/^_Ref\d+$/);
      const want = expected(kind, format, tag);
      if (want !== null) expect(shown, `${where}: the text it caches`).toBe(want);
      // Reachable again: a bookmark by its name, a note by its id.
      const name = String(ref.attrs.name ?? '');
      const reached = ref.attrs.kind === 'note'
        ? noteTargets(editor.state.doc, DEFAULT_NOTE_SETTINGS).has(name)
        : !!findTarget(editor.state.doc, name);
      expect(reached, `${where}: the target is reachable`).toBe(true);
    });
  });

  it('keeps every one of them through ODT and through DOCX', async () => {
    const doc = editor.getJSON() as N;
    const sent = refsOf(editor.state.doc).map((r) => spell(r.attrs.kind, r.attrs.format));
    for (const [file, back] of [
      ['ODT', importOdt(await buildOdt(doc, DEFAULT_MARGINS, 'portrait')).content as unknown as N],
      ['DOCX', importDocx(await buildDocx(doc, DEFAULT_MARGINS, 'portrait')).content as unknown as N],
    ] as const) {
      const refs = walk(back, 'crossRef');
      expect(refs.map((r) => spell(r.attrs.kind, r.attrs.format)),
        `${tag}: ${file} keeps every reference`).toEqual(file === 'ODT' ? sent : sent.map(asWordSays));
      const node = PMNode.fromJSON(SCHEMA, back);
      const notes = noteTargets(node, DEFAULT_NOTE_SETTINGS);
      const dangling = refs
        .filter((r) => (r.attrs.kind === 'note' ? !notes.has(String(r.attrs.name)) : !findTarget(node, String(r.attrs.name))))
        .map((r) => `${r.attrs.kind ?? 'bookmark'}/${r.attrs.format} -> ${r.attrs.name}`);
      expect(dangling, `${tag}: ${file} keeps every target`).toEqual([]);
    }
  });
});

// A note's own text takes inline content only, so neither a heading nor a list reaches
// it — a bookmark and a caption number do, and both files have to keep them there.
describe('a target in a note of its own', () => {
  const doc: N = { type: 'doc', content: [
    P(T('Body'), anchor('fa', 'footnote', '1')),
    P(T('Refs:')),
    { type: 'noteSection', content: [
      { type: 'note', attrs: { id: 'fa', kind: 'footnote', label: null, text: '1' },
        content: [T('Figure '), seq('figure'), T(': in a note. '), T('Marked note', bm('mark_note'))] },
    ] },
  ] };

  it('is offered, inserted and kept by both formats', async () => {
    const editor = makeEditor(doc);
    for (const kind of ['bookmark', 'figure'] as const) {
      const target = refTargets(editor.state.doc, kind, SHEET, DEFAULT_NOTE_SETTINGS)[0];
      expect(target, `${kind}: a target in the note`).toBeTruthy();
      const format: CrossRefFormat = kind === 'figure' ? 'category-and-value' : 'text';
      const range = refRange(editor.state.doc, target, format);
      editor.commands.setTextSelection(sinkEnd(editor.state.doc));
      editor.commands.insertCrossRef({ name: target.name, from: range.from, to: range.to, format, kind: target.kind });
    }
    expect(refsOf(editor.state.doc).map((r) => String(r.attrs.text))).toEqual(['Marked note', 'Figure 1']);

    const json = editor.getJSON() as N;
    for (const [file, back] of [
      ['ODT', importOdt(await buildOdt(json, DEFAULT_MARGINS, 'portrait')).content as unknown as N],
      ['DOCX', importDocx(await buildDocx(json, DEFAULT_MARGINS, 'portrait')).content as unknown as N],
    ] as const) {
      const node = PMNode.fromJSON(SCHEMA, back);
      const dangling = walk(back, 'crossRef')
        .filter((r) => !findTarget(node, String(r.attrs.name))).map((r) => String(r.attrs.name));
      expect(dangling, `${file} keeps a target that sits in a note`).toEqual([]);
    }
    editor.destroy();
  });
});

describe('the pieces a reference is assembled from', () => {
  it('maps every number format onto the target\'s own number', () => {
    const editor = makeEditor({ type: 'doc', content: [
      { type: 'heading', attrs: { level: 1 }, content: [T('One')] },
      { type: 'heading', attrs: { level: 2 }, content: [T('One A')] },
      { type: 'orderedList', content: [{ type: 'listItem', content: [P(T('First'))] },
        { type: 'listItem', content: [P(T('Second'))] }] },
    ] });
    const doc = editor.state.doc;
    const sheet = { ...SHEET, outline: [1, 2, 3].map(() => ({ ...DEFAULT_OUTLINE_LEVEL, format: '1', displayLevels: 3 })) };
    const headings = headingNumbers(doc, sheet.outline);
    const at = (text: string) => {
      let found = -1;
      doc.descendants((node, pos) => { if (node.isTextblock && node.textContent === text) found = pos + 1; });
      return found;
    };
    const number = (text: string, format: CrossRefFormat, sep: string | null = null) =>
      numberAt(doc, at(text), format, sep, sheet, headings);

    expect(number('One A', 'number')).toBe('1.1');
    expect(number('One A', 'number-no-superior')).toBe('1');
    expect(number('One A', 'number-all-superior')).toBe('1.1');
    expect(number('One A', 'number-all-superior', '-')).toBe('1-1');
    expect(number('Second', 'number')).toBe('2');
    expect(number('Second', 'number-all-superior')).toBe('2');
    expect(number('One', 'text'), 'a format that is not a number still gets the label').toBe('1');
    editor.destroy();
  });

  it('sanitizes a name to what Word writes', () => {
    expect(sanitizeBookmarkName('Moving toolbars')).toBe('Moving_toolbars');
    expect(sanitizeBookmarkName('2. Kapitel')).toBe('_2._Kapitel');
    expect(sanitizeBookmarkName('  ')).toBe('');
    expect(sanitizeBookmarkName('x'.repeat(60))).toHaveLength(40);
  });

  it('drops one bookmark by name and leaves the one it overlaps', () => {
    const editor = makeEditor({ type: 'doc', content: [P(T('Target', bm('outer'), bm('inner')))] });
    editor.commands.removeBookmark('outer');
    expect(bookmarks(editor.state.doc).map((b) => b.name)).toEqual(['inner']);
    expect(editor.commands.removeBookmark('gone')).toBe(false);
    editor.destroy();
  });
});
