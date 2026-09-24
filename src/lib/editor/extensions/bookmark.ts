import { Mark, mergeAttributes } from '@tiptap/core';
import type { Node as PMNode, Mark as PMMark } from '@tiptap/pm/model';
import { TextSelection } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { inlineText } from './outline';

// A bookmark: a named range of text, the target a cross-reference or internal link points
// at. A mark, not a point node — both formats store a range (ODF text:bookmark-start/-end,
// DOCX w:bookmarkStart/-End) and a REF field needs it to recompute its text.

export type BookmarkRef = { name: string; from: number; to: number; text: string };

// Fired by the context menu; ToolbarExpanded owns the dialog (as it does for links).
export const OPEN_BOOKMARK_DIALOG_EVENT = 'odf-open-bookmark-dialog';

// Bookmark names as Word writes them: letters, digits, underscore and dot, never
// leading with a digit, 40 chars at most. Sanitizing here also keeps the ODF export's
// sentinel pass free of XML escaping.
export function sanitizeBookmarkName(raw: string): string {
  const cleaned = raw.trim().replace(/[^A-Za-z0-9_.]/g, '_').slice(0, 40);
  if (!cleaned) return '';
  return /^[0-9]/.test(cleaned) ? `_${cleaned}`.slice(0, 40) : cleaned;
}

// Every bookmark on a run: Word and ODF both nest ranges, so one piece of text can
// carry several names.
export function bookmarkNamesOf(marks: readonly PMMark[]): string[] {
  return marks.filter((m) => m.type.name === 'bookmark')
    .map((m) => String(m.attrs?.name ?? '')).filter(Boolean);
}

// Every bookmark range in document order. Adjacent text nodes sharing a name merge into
// one range; a name that reappears later gets its own entry, and lookups take the first.
// ponytail: no cross-paragraph merge — the DOCX exporter can't write one either.
export function bookmarks(doc: PMNode): BookmarkRef[] {
  const out: BookmarkRef[] = [];
  const open = new Map<string, BookmarkRef>();
  doc.descendants((node, pos) => {
    // Inline atoms count too: a bookmark over a caption's number or a note's anchor has
    // no text node to hold on to, and the field's cached string is what it shows. An
    // inline frame carries blocks of its own, and a bookmark inside it lives on that text.
    if (!node.isInline || !node.isAtom) return true;
    const names = new Set(bookmarkNamesOf(node.marks));
    for (const [name, ref] of open) if (!names.has(name) || ref.to !== pos) open.delete(name);
    const text = inlineText(node);
    for (const name of names) {
      const ref = open.get(name);
      if (ref) {
        ref.to = pos + node.nodeSize;
        ref.text += text;
        continue;
      }
      const fresh = { name, from: pos, to: pos + node.nodeSize, text };
      out.push(fresh);
      open.set(name, fresh);
    }
    return false;
  });
  return out;
}

export function findBookmark(doc: PMNode, name: string): BookmarkRef | null {
  return bookmarks(doc).find((b) => b.name === name) ?? null;
}

// The target a "#…" link or a cross-reference names. ODF also addresses a heading by
// its own text with a "|outline" suffix, which no bookmark answers to.
export function findTarget(doc: PMNode, ref: string): BookmarkRef | null {
  const name = ref.startsWith('#') ? ref.slice(1) : ref;
  const found = findBookmark(doc, name);
  if (found || !name.endsWith('|outline')) return found;
  const text = name.slice(0, -'|outline'.length);
  let hit: BookmarkRef | null = null;
  doc.descendants((node, pos) => {
    if (hit || !node.isBlock) return !hit;
    if (node.type.name !== 'heading' || node.textContent !== text) return true;
    hit = { name, from: pos + 1, to: pos + node.nodeSize - 1, text };
    return false;
  });
  return hit;
}

// Follow a reference: scroll its target into view and select it, as both word
// processors do on a modifier-click. False where nothing answers to the name.
export function goToTarget(view: EditorView, ref: string): boolean {
  const found = findTarget(view.state.doc, ref);
  if (!found) return false;
  const at = view.domAtPos(found.from).node;
  const el = (at.nodeType === 1 ? at : at.parentElement) as HTMLElement | null;
  el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, found.from, found.to)));
  view.focus();
  return true;
}

// Unique names, document order — the pick list of both dialogs.
export function bookmarkNames(doc: PMNode): string[] {
  return [...new Set(bookmarks(doc).map((b) => b.name))];
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    bookmark: {
      setBookmark: (name: string) => ReturnType;
      unsetBookmark: () => ReturnType;
      removeBookmark: (name: string) => ReturnType;
    };
  }
}

export const Bookmark = Mark.create({
  name: 'bookmark',
  // The range is fixed: typing at either end stays outside it, as it does in Word.
  inclusive: false,
  // Ranges overlap in both formats — a heading's own name inside the contents' one —
  // so a run keeps every bookmark it is in rather than only the outermost.
  excludes: '',

  addAttributes() {
    return {
      name: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-bookmark') || '',
        renderHTML: (attrs) => ({ 'data-bookmark': String(attrs.name ?? '') }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-bookmark]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes), 0];
  },

  addCommands() {
    return {
      setBookmark:
        (name) =>
        ({ commands }) => {
          const clean = sanitizeBookmarkName(name);
          return clean ? commands.setMark(this.name, { name: clean }) : false;
        },
      unsetBookmark:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
      // Drop a bookmark by name from wherever it sits — the delete affordance in the
      // dialog, which works without moving the selection there first.
      removeBookmark:
        (name) =>
        ({ tr, state, dispatch }) => {
          const ranges = bookmarks(state.doc).filter((b) => b.name === name);
          if (!ranges.length) return false;
          if (dispatch) {
            // By name, not by type: a run inside another bookmark's range keeps that one.
            for (const r of ranges) tr.removeMark(r.from, r.to, state.schema.marks.bookmark.create({ name }));
          }
          return true;
        },
    };
  },
});
