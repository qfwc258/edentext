import { describe, it, expect } from 'vitest';
import { Schema, type Node as PMNode } from '@tiptap/pm/model';
import { EditorState, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { blockDeco, isBlockDeco, repairBlockDecos } from '../../src/lib/editor/extensions/pageBreaks';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*', toDOM: () => ['p', 0] },
    heading: { group: 'block', content: 'inline*', attrs: { level: { default: 1 } }, toDOM: () => ['h1', 0] },
    text: { group: 'inline' },
  },
});

const para = (text: string) => schema.node('paragraph', null, [schema.text(text)]);
const state = () => EditorState.create({ doc: schema.node('doc', null, [para('one'), para('two')]) });

// The inset a section on narrower paper puts on every one of its blocks.
function insets(doc: PMNode): DecorationSet {
  const decos: Decoration[] = [];
  doc.forEach((node, offset) => decos.push(blockDeco(offset, offset + node.nodeSize, { style: '--sec-inset-left:164px' })));
  return DecorationSet.create(doc, decos);
}

// What the plugin does on a doc change: map, and repair where the mapping dropped one.
function remap(before: DecorationSet, tr: Transaction): Array<[number, number]> {
  let dropped = false;
  const mapped = before.map(tr.mapping, tr.doc, { onRemove: (spec) => { dropped ||= isBlockDeco(spec); } });
  const after = dropped ? repairBlockDecos(before, mapped, tr) : mapped;
  return after.find().map((d) => [d.from, d.to]);
}

describe('block decorations across a doc change', () => {
  it('keeps the one on a block whose type changed', () => {
    const tr = state().tr;
    const before = insets(tr.doc);
    tr.setNodeMarkup(0, schema.nodes.heading, { level: 2 });
    // Without the repair the mapping loses it: a replaced node deletes its own boundaries.
    expect(before.map(tr.mapping, tr.doc).find()).toHaveLength(1);
    expect(remap(before, tr)).toEqual([[0, 5], [5, 10]]);
  });

  it('keeps the one on a block whose attrs changed', () => {
    const tr = state().tr;
    const before = insets(tr.doc);
    tr.setNodeMarkup(5, schema.nodes.paragraph, {});
    expect(remap(before, tr)).toEqual([[0, 5], [5, 10]]);
  });

  it('covers both halves of a split block', () => {
    const tr = state().tr;
    const before = insets(tr.doc);
    tr.split(3);
    expect(remap(before, tr)).toEqual([[0, 4], [4, 7], [7, 12]]);
  });

  it('drops the one whose block is gone', () => {
    const tr = state().tr;
    const before = insets(tr.doc);
    tr.delete(0, 5);
    expect(remap(before, tr)).toEqual([[0, 5]]);
  });

  it('leaves typing to the mapping', () => {
    const tr = state().tr;
    const before = insets(tr.doc);
    tr.insertText('x', 2);
    expect(remap(before, tr)).toEqual([[0, 6], [6, 11]]);
  });
});
