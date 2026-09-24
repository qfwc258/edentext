// Enter in a block that forces a page must not give the new block the break as well:
// the attr is the break itself, not paragraph formatting that a successor inherits.
import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { PageBreak } from '../../src/lib/editor/extensions/pageBreak';

type N = any;

function makeEditor() {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return new Editor({
    element: el,
    extensions: [Document, Paragraph, Text, PageBreak],
    content: {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'lead' }] },
        { type: 'paragraph', attrs: { breakBefore: 'page' }, content: [{ type: 'text', text: 'page two' }] },
      ],
    },
  });
}
const breaks = (editor: Editor) => (editor.getJSON().content as N[]).map((n) => n.attrs?.breakBefore ?? null);

describe('page break before is not inherited on split', () => {
  it('leaves the block Enter opens at the end of the page-break block without one', () => {
    const editor = makeEditor();
    editor.commands.focus('end');
    editor.commands.splitBlock();
    expect(breaks(editor)).toEqual([null, 'page', null]);
    editor.destroy();
  });

  it('leaves the second half of a split page-break block without one', () => {
    const editor = makeEditor();
    editor.commands.setTextSelection(11); // between "page" and " two"
    editor.commands.splitBlock();
    expect(breaks(editor)).toEqual([null, 'page', null]);
    editor.destroy();
  });

  it('still marks the block Ctrl+Enter opens', () => {
    const editor = makeEditor();
    editor.commands.focus('end');
    editor.commands.insertPageBreak();
    expect(breaks(editor)).toEqual([null, 'page', 'page']);
    editor.destroy();
  });
});
