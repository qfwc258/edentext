import { describe, it, expect } from 'vitest';
import { getSchema } from '@tiptap/core';
import { Fragment, Slice } from '@tiptap/pm/model';
import { extensions } from '../../src/lib/editor/extensions';
import { dropRemoteImages, unwrapPastedBoxes, flattenToInline, plainPastedSpaces } from '../../src/lib/editor/paste';

const schema = getSchema(extensions);
const para = (text: string) => schema.nodes.paragraph.create(null, schema.text(text));
const box = (attrs: Record<string, unknown>, blocks = [para('one'), para('two')]) =>
  schema.nodes.textBox.create(attrs, blocks);
const slice = (...nodes: ReturnType<typeof para>[]) => Slice.maxOpen(Fragment.fromArray(nodes), true);

describe('unwrapPastedBoxes', () => {
  it('spills the blocks of every box the paste invented', () => {
    // A paste of text plus a table gets one wrapper box per block that did not fit.
    const out = unwrapPastedBoxes(slice(box({}), box({}, [para('three')])));
    expect(out.content.childCount).toBe(3);
    expect(out.content.child(0).type.name).toBe('paragraph');
  });

  it('keeps a box that carries a size, which every real one does', () => {
    const pasted = slice(box({ width: 280, height: 120 }));
    expect(unwrapPastedBoxes(pasted)).toBe(pasted);
  });
});

describe('flattenToInline', () => {
  it('joins blocks with line breaks, boxes walked into', () => {
    const out = flattenToInline(slice(para('a'), box({ width: 280 }, [para('b')])), schema);
    expect(out.content.content.map(n => (n.isText ? n.text : n.type.name)))
      .toEqual(['a', 'hardBreak', 'b']);
  });
});

describe('dropRemoteImages', () => {
  const image = (src: string) => schema.nodes.image.create({ src });

  it('removes remote URLs while preserving local image schemes', () => {
    const pasted = slice(schema.nodes.paragraph.create(null, [
      image('https://tracker.invalid/pixel.png'), image('data:image/png;base64,AA=='), image('idb:image-1'),
    ]));
    const out = dropRemoteImages(pasted);
    expect(out.content.firstChild!.childCount).toBe(2);
    expect(out.content.firstChild!.child(0).attrs.src).toMatch(/^data:/);
    expect(out.content.firstChild!.child(1).attrs.src).toMatch(/^idb:/);
  });
});

describe('plainPastedSpaces', () => {
  it('gives a block joined only by no-break spaces plain ones', () => {
    const out = plainPastedSpaces(slice(para('the\u00a0the\u00a0end'), para('10\u00a0ms and more')));
    expect(out.content.child(0).textContent).toBe('the the end');
    // Ordinary spaces beside it: the no-break one was meant.
    expect(out.content.child(1).textContent).toBe('10\u00a0ms and more');
  });
});
