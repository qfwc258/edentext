// Inserting a cross-reference from the window: the reference caches the text of the
// range it was made over, and mints the bookmark that keeps it resolvable. A caption
// lives inside a text box wherever LibreOffice framed it with its picture, which is
// where the reference has to read it from.
import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/core';
import { extensions } from '../../src/lib/editor/extensions';
import { refTargets, refRange } from '../../src/lib/editor/extensions/crossReference';
import { builtinStyleSheet } from '../../src/lib/styles/styleSheet';
import { DEFAULT_NOTE_SETTINGS } from '../../src/lib/storage/noteSettings';

type N = any;

// jsdom has none; the text box's node view observes its own size.
(globalThis as any).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };

const seq = { type: 'sequenceField', attrs: { category: 'figure', format: '1', number: 1 } };
const caption: N = {
  type: 'paragraph',
  content: [{ type: 'text', text: 'Figure ' }, seq, { type: 'text', text: ': the dialog' }],
};
const doc = (...content: N[]): N => ({ type: 'doc', content });

function makeEditor(content: N) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return new Editor({ element: el, extensions, content });
}

// Every reference in the document, in order, as [format, shown text].
const refs = (editor: Editor): [string, string][] => {
  const out: [string, string][] = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name !== 'crossRef') return true;
    out.push([String(node.attrs.format), String(node.attrs.text)]);
    return false;
  });
  return out;
};

function insertFirst(editor: Editor, format: string, withDirection = false) {
  const [target] = refTargets(editor.state.doc, 'figure', builtinStyleSheet(), DEFAULT_NOTE_SETTINGS);
  expect(target, 'a figure target').toBeTruthy();
  const range = refRange(editor.state.doc, target, format as never);
  editor.commands.setTextSelection(1);
  editor.commands.insertCrossRef({
    name: target.name, from: range.from, to: range.to, format: format as never, kind: target.kind,
    withDirection,
  });
}

describe('inserting a cross-reference', () => {
  it('reads a caption boxed with its picture, not just a loose one', () => {
    const boxed = makeEditor(doc(
      { type: 'paragraph' },
      { type: 'paragraph', content: [{ type: 'textBox', content: [caption] }] },
    ));
    insertFirst(boxed, 'text');
    expect(refs(boxed)).toEqual([['text', 'Figure 1: the dialog']]);
    boxed.destroy();

    const loose = makeEditor(doc({ type: 'paragraph' }, caption));
    insertFirst(loose, 'category-and-value');
    expect(refs(loose)).toEqual([['category-and-value', 'Figure 1']]);
    loose.destroy();
  });

  it('words the direction field at once, rather than showing its bookmark name', () => {
    const editor = makeEditor(doc({ type: 'paragraph' }, caption));
    insertFirst(editor, 'text', true);
    expect(refs(editor)).toEqual([['text', 'Figure 1: the dialog'], ['direction', 'below']]);
    editor.destroy();
  });
});
