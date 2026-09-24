import { Fragment, Slice } from '@tiptap/pm/model';
import type { Node as PMNode, Schema } from '@tiptap/pm/model';

const LOCAL_IMAGE_SRC = /^(?:data:|idb:)/i;

// A pasted web image must not get as far as a node view: assigning its URL to img.src
// would disclose the reader's IP before the editor has made a deliberate choice to load it.
export function dropRemoteImages(slice: Slice): Slice {
  let dropped = false;
  const clean = (fragment: Fragment): Fragment => {
    const nodes: PMNode[] = [];
    fragment.forEach(node => {
      if (node.type.name === 'image') {
        const src = node.attrs.src;
        if (typeof src === 'string' && !LOCAL_IMAGE_SRC.test(src)) { dropped = true; return; }
      }
      nodes.push(node.content.size ? node.copy(clean(node.content)) : node);
    });
    return Fragment.fromArray(nodes);
  };
  const content = clean(slice.content);
  return dropped ? Slice.maxOpen(content) : slice;
}

// Fitting foreign HTML into this schema. ProseMirror's own fitting reaches for a text box
// wherever blocks don't fit — it is the one inline node that holds them — and drops what
// it cannot place at all; both are wrong for a paste from a web page.

/**
 * Spill the blocks of the boxes the paste invented (one per block that didn't fit the
 * caret's line). Every real box carries a size — the insert command and both importers
 * set one — so a bare one is that wrapper. Left in, a paste into a box would be dropped
 * whole: a box inside a box never enters the document.
 */
export function unwrapPastedBoxes(slice: Slice): Slice {
  const out: PMNode[] = [];
  let wrapped = false;
  slice.content.forEach(node => {
    const bare = node.type.name === 'textBox' && node.attrs.width === null && node.attrs.height === null;
    wrapped ||= bare;
    if (bare) node.content.forEach(child => out.push(child));
    else out.push(node);
  });
  return wrapped ? Slice.maxOpen(Fragment.fromArray(out)) : slice;
}

/**
 * Everything the slice says, as inline content with a line break per block — for the
 * targets that hold no blocks at all: a header/footer zone and a note body. Pasted blocks
 * would otherwise be wrapped in a box neither file keeps, or be dropped from the second
 * block on. Both importers write a zone's paragraphs as the same breaks.
 */
export function flattenToInline(slice: Slice, schema: Schema): Slice {
  const br = schema.nodes.hardBreak;
  const out: PMNode[] = [];
  const walk = (frag: Fragment) => frag.forEach(node => {
    // A box holds blocks itself, so it is walked into rather than kept.
    if (node.isInline && node.type.name !== 'textBox') return void out.push(node);
    // One break per text block, empty ones included — the blank line they are; a list, a
    // table or a box only holds those blocks and adds no break of its own.
    if (node.isTextblock && out.length && br) out.push(br.create());
    walk(node.content);
  });
  walk(slice.content);
  return new Slice(Fragment.fromArray(out), 0, 0);
}

/**
 * A web editor's copy can join every word with a no-break space; a block with no ordinary
 * space left could only break inside a word. Such a block gets plain spaces back, while a
 * block with ordinary spaces keeps its no-break ones as meant ("10 ms").
 */
export function plainPastedSpaces(slice: Slice): Slice {
  let changed = false;
  const clean = (fragment: Fragment): Fragment => {
    const nodes: PMNode[] = [];
    fragment.forEach(node => {
      const text = node.isTextblock ? node.textContent : '';
      if (text.includes(' ') && !text.includes(' ')) {
        changed = true;
        const inline: PMNode[] = [];
        node.content.forEach(n => inline.push(n.isText ? n.type.schema.text(n.text!.replace(/ /g, ' '), n.marks) : n));
        nodes.push(node.copy(Fragment.fromArray(inline)));
      } else nodes.push(node.content.size && !node.isTextblock ? node.copy(clean(node.content)) : node);
    });
    return Fragment.fromArray(nodes);
  };
  const content = clean(slice.content);
  return changed ? new Slice(content, slice.openStart, slice.openEnd) : slice;
}
