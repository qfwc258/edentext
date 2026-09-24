// The numbers a cross-reference can point at are drawn by CSS counters on the page, so
// nothing can read them back off the DOM — headingNumbers and listNumberAt recount them.
import { describe, it, expect } from 'vitest';
import { getSchema } from '@tiptap/core';
import type { Node as PmNode } from '@tiptap/pm/model';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import Heading from '@tiptap/extension-heading';
import ListItem from '@tiptap/extension-list-item';
import { OrderedList } from '../../src/lib/editor/extensions/orderedList';
import { BulletList } from '../../src/lib/editor/extensions/bulletList';
import { headingNumbers } from '../../src/lib/editor/extensions/outline';
import { listNumberAt } from '../../src/lib/editor/extensions/listStyle';
import { DEFAULT_OUTLINE_LEVEL, type OutlineNumbering } from '../../src/lib/styles/outlineNumbering';
import type { StyleSheet } from '../../src/lib/styles/styleSheet';

const schema = getSchema([Document, Paragraph, Text, Heading, ListItem, OrderedList, BulletList]);

const EMPTY_SHEET: StyleSheet = { paragraph: {}, character: {}, table: {}, list: {} };

const h = (level: number, text: string) =>
  schema.nodes.heading.create({ level }, schema.text(text));
const p = (text: string) => schema.nodes.paragraph.create(null, schema.text(text));
const item = (...content: PmNode[]) => schema.nodes.listItem.create(null, content);

const numbering = (...levels: Partial<typeof DEFAULT_OUTLINE_LEVEL>[]): OutlineNumbering =>
  levels.map((l) => ({ ...DEFAULT_OUTLINE_LEVEL, format: '1', ...l }));

// Every heading's label and bare ordinals, in document order.
const numbersOf = (doc: PmNode, def: OutlineNumbering) =>
  [...headingNumbers(doc, def).values()].map((n) => [n.label, n.parts.join('.')]);

describe('heading numbers', () => {
  const doc = schema.nodes.doc.create(null, [
    h(1, 'One'), h(2, 'One A'), h(2, 'One B'), h(3, 'One B i'), h(1, 'Two'),
  ]);

  it('counts each level and restarts the deeper ones', () => {
    expect(numbersOf(doc, numbering({ displayLevels: 3 }, { displayLevels: 3 }, { displayLevels: 3 }))).toEqual([
      ['1 ', '1'], ['1.1 ', '1.1'], ['1.2 ', '1.2'], ['1.2.1 ', '1.2.1'], ['2 ', '2'],
    ]);
  });

  it('shows only what display-levels asks for, but keeps the full chain in parts', () => {
    const one = numbering({}, {}, {});
    expect(numbersOf(doc, one)).toEqual([
      ['1 ', '1'], ['1 ', '1.1'], ['2 ', '1.2'], ['1 ', '1.2.1'], ['2 ', '2'],
    ]);
  });

  it('honours prefix, suffix, start and a per-level format', () => {
    const def = numbering({ prefix: 'Ch. ', suffix: ': ', start: 3 }, { format: 'a', displayLevels: 2 });
    expect(numbersOf(doc, def).slice(0, 2)).toEqual([['Ch. 3: ', '3'], ['3.a ', '3.a']]);
  });

  it('leaves out a level switched off in the middle of the chain', () => {
    const def = numbering({ displayLevels: 3 }, { format: 'none' }, { displayLevels: 3 });
    expect(numbersOf(doc, def).map((n) => n[1])).toEqual(['1', '1', '1', '1.1', '2']);
  });

  it('returns nothing when no level is numbered', () => {
    expect(headingNumbers(doc, numbering({ format: 'none' })).size).toBe(0);
  });

  it('skips a heading inside a list item, which neither product numbers', () => {
    const nested = schema.nodes.doc.create(null, [
      h(1, 'One'),
      schema.nodes.orderedList.create(null, [item(h(1, 'In a list'))]),
      h(1, 'Two'),
    ]);
    expect(numbersOf(nested, numbering({}))).toEqual([['1 ', '1'], ['2 ', '2']]);
  });
});

describe('list numbers', () => {
  // Position of the paragraph holding `text`.
  function at(doc: PmNode, text: string): number {
    let found = -1;
    doc.descendants((node, pos) => {
      if (node.type.name === 'paragraph' && node.textContent === text) found = pos;
    });
    return found;
  }
  const numberAt = (doc: PmNode, text: string) => listNumberAt(doc, at(doc, text), EMPTY_SHEET);

  it('counts the items of a flat list', () => {
    const doc = schema.nodes.doc.create(null, schema.nodes.orderedList.create(null, [
      item(p('first')), item(p('second')), item(p('third')),
    ]));
    expect(numberAt(doc, 'third')).toEqual({ parts: ['3'], multilevel: false });
  });

  it('starts where the list says', () => {
    const doc = schema.nodes.doc.create(null, schema.nodes.orderedList.create({ start: 5 }, [
      item(p('first')), item(p('second')),
    ]));
    expect(numberAt(doc, 'second')?.parts).toEqual(['6']);
  });

  it('walks the nesting and follows the depth cycle into letters', () => {
    const doc = schema.nodes.doc.create(null, schema.nodes.orderedList.create(null, [
      item(p('one')),
      item(p('two'), schema.nodes.orderedList.create(null, [item(p('two a')), item(p('two b'))])),
    ]));
    expect(numberAt(doc, 'two b')).toEqual({ parts: ['2', 'b'], multilevel: false });
  });

  it('reports a multilevel list so the whole chain can be shown', () => {
    const doc = schema.nodes.doc.create(null, schema.nodes.orderedList.create({ listStyleType: 'multilevel' }, [
      item(p('one'), schema.nodes.orderedList.create(null, [item(p('one one'))])),
    ]));
    expect(numberAt(doc, 'one one')).toEqual({ parts: ['1', '1'], multilevel: true });
  });

  it('has no number for a bullet item, and none outside a list', () => {
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.bulletList.create(null, [item(p('bullet'))]),
      p('loose'),
    ]);
    expect(numberAt(doc, 'bullet')).toBeNull();
    expect(numberAt(doc, 'loose')).toBeNull();
  });

  it('numbers a numbered level nested under a bullet one', () => {
    const doc = schema.nodes.doc.create(null, schema.nodes.bulletList.create(null, [
      item(p('bullet'), schema.nodes.orderedList.create(null, [item(p('a')), item(p('b'))])),
    ]));
    expect(numberAt(doc, 'b')?.parts).toEqual(['b']);
  });
});
