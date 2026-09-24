import { describe, it, expect } from 'vitest';
import { PageGrid, gridFromRuns, type Band } from '../../src/lib/editor/extensions/pageBreaks';

// A4 portrait / landscape at 96dpi, plus the 20px gap between two pages.
const P = 1123;
const L = 794;
const GAP = 20;

describe('PageGrid', () => {
  it('is uniform until a section says otherwise', () => {
    const g = new PageGrid(P);
    expect(g.topOf(1)).toBe(0);
    expect(g.topOf(3)).toBe(2 * (P + GAP));
    expect(g.pageAt(0)).toBe(1);
    expect(g.pageAt(P + GAP)).toBe(2);
    expect(g.pageAt(2 * (P + GAP) + 10)).toBe(3);
  });

  it('moves every page below a section on its own paper', () => {
    const g = new PageGrid(P);
    g.setFrom(2, L);
    g.setFrom(3, P);
    expect(g.heightOf(2)).toBe(L);
    expect(g.heightOf(3)).toBe(P);
    expect(g.topOf(2)).toBe(P + GAP);
    expect(g.topOf(3)).toBe(P + GAP + L + GAP);
    expect(g.pageAt(P + GAP)).toBe(2);
    expect(g.pageAt(P + GAP + L + GAP)).toBe(3);
    expect(g.bottomOf(3)).toBe(P + GAP + L + GAP + P);
  });

  it('lets a later run replace one it starts on', () => {
    const g = new PageGrid(P);
    g.setFrom(4, L);
    g.setFrom(4, P);
    expect(g.heightOf(4)).toBe(P);
    expect(g.topOf(5)).toBe(4 * (P + GAP));
  });

  it('boxes every page for the layers that paint them', () => {
    const g = new PageGrid(P);
    g.setFrom(2, L);
    expect(g.boxes(3)).toEqual([
      { top: 0, height: P },
      { top: P + GAP, height: L },
      { top: P + GAP + L + GAP, height: L },
    ]);
  });

  it('reads back the runs it publishes', () => {
    const g = gridFromRuns(`2|${L},3|${P}`, P);
    expect(g.heightOf(1)).toBe(P);
    expect(g.heightOf(2)).toBe(L);
    expect(g.heightOf(3)).toBe(P);
    // A document with no sections writes no runs at all.
    expect(gridFromRuns('', P).heightOf(9)).toBe(P);
  });

  // [topFirst, topRest, bottomFirst, bottomRest] — a page's own header and footer reach.
  const BASE: Band = [76, 76, 76, 76];

  it('gives a section its own content band', () => {
    // A section whose footer stands in the text area ends its pages higher than the
    // document's do — the reach the index and the column flow place against.
    const g = gridFromRuns(`1|${P}|0|76|76|76|76,3|${P}|0|76|76|131|131`, P, BASE);
    expect(g.contentBottomOf(2)).toBe(P + GAP + P - 76);
    expect(g.contentBottomOf(3)).toBe(2 * (P + GAP) + P - 131);
    expect(g.contentBottomOf(4)).toBe(3 * (P + GAP) + P - 131);
  });

  it("keeps a section's first page on its own reach", () => {
    const g = new PageGrid(P, 0, BASE);
    g.setFrom(2, P, 0, [200, 76, 300, 131]);
    expect(g.contentTopOf(2)).toBe(P + GAP + 200);
    expect(g.contentTopOf(3)).toBe(2 * (P + GAP) + 76);
    expect(g.contentBottomOf(2)).toBe(P + GAP + P - 300);
    expect(g.contentBottomOf(3)).toBe(2 * (P + GAP) + P - 131);
  });

  it('falls back to the document band where a run carries none', () => {
    // An older run string, and the uniform document that writes no runs at all.
    expect(gridFromRuns(`2|${L}`, P, BASE).contentBottomOf(2)).toBe(P + GAP + L - 76);
    expect(gridFromRuns('', P, BASE).contentTopOf(3)).toBe(2 * (P + GAP) + 76);
  });
});
