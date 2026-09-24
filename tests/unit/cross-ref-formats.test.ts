// A cross-reference carries ODF's own reference-format vocabulary; Word spells the same
// thing as field switches, and a caption or a note has its own element in ODF. Every
// format has to survive both formats in both directions.
import { describe, it, expect } from 'vitest';
import { unzipSync, strFromU8, zipSync, strToU8 } from 'fflate';
import { buildOdt } from '../../src/lib/export/odt';
import { buildDocx } from '../../src/lib/export/docx';
import { importOdt } from '../../src/lib/import/odt';
import { importDocx } from '../../src/lib/import/docx';
import { DEFAULT_MARGINS } from '../../src/lib/storage/pageMargins';

type N = { type: string; attrs?: any; content?: N[]; marks?: any[]; text?: string };

const T = (text: string, ...marks: any[]): N => ({ type: 'text', text, ...(marks.length ? { marks } : {}) });
const P = (...content: N[]): N => ({ type: 'paragraph', attrs: {}, content });
const bm = (name: string) => ({ type: 'bookmark', attrs: { name } });
const ref = (attrs: Record<string, unknown>): N => ({ type: 'crossRef', attrs: { text: '', ...attrs } });

function walk(node: N, type: string, out: N[] = []): N[] {
  if (node.type === type) out.push(node);
  for (const c of node.content ?? []) walk(c, type, out);
  return out;
}

const content = async (doc: N) => strFromU8(unzipSync(await buildOdt(doc as any, DEFAULT_MARGINS, 'portrait'))['content.xml']);
const documentXml = async (doc: N) => strFromU8(unzipSync(await buildDocx(doc as any, DEFAULT_MARGINS, 'portrait'))['word/document.xml']);
const instrs = (xml: string) => [...xml.matchAll(/<w:fldSimple w:instr="([^"]*)"/g)].map((m) => m[1].replace(/&quot;/g, '"'));

// A heading, its bookmark, and one reference per format.
const FORMATS = ['text', 'page', 'number', 'number-no-superior', 'number-all-superior', 'direction'] as const;
const headingDoc: N = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1 }, content: [T('Chapter', bm('Head1'))] },
    P(...FORMATS.map((format) => ref({ name: 'Head1', format }))),
  ],
};

describe('cross-reference formats in ODF', () => {
  it('writes every format on a bookmark reference and reads it back', async () => {
    const xml = await content(headingDoc);
    for (const format of FORMATS) {
      expect(xml).toContain(`<text:bookmark-ref text:reference-format="${format}" text:ref-name="Head1">`);
    }
    const back = importOdt(await buildOdt(headingDoc as any, DEFAULT_MARGINS, 'portrait')).content as unknown as N;
    expect(walk(back, 'crossRef').map((r) => r.attrs.format)).toEqual([...FORMATS]);
  });

  it("writes a caption reference as LibreOffice's own sequence field", async () => {
    const doc: N = {
      type: 'doc',
      content: [
        P(T('Figure ', bm('Cap1')), { type: 'sequenceField', attrs: { category: 'figure', format: '1', number: 1 }, marks: [bm('Cap1')] }, T(': a picture')),
        P(ref({ name: 'Cap1', format: 'category-and-value', kind: 'sequence', text: 'Figure 1' })),
      ],
    };
    const xml = await content(doc);
    expect(xml).toMatch(/<text:sequence-ref text:reference-format="category-and-value" text:ref-name="refIllustration0">/);

    const back = importOdt(await buildOdt(doc as any, DEFAULT_MARGINS, 'portrait')).content as unknown as N;
    const [r] = walk(back, 'crossRef');
    expect([r.attrs.kind, r.attrs.format, r.attrs.name]).toEqual(['sequence', 'category-and-value', 'refIllustration0']);
  });

  it('writes a note reference as text:note-ref and reads it back', async () => {
    const doc: N = {
      type: 'doc',
      content: [
        P(T('Body'), { type: 'noteRef', attrs: { id: 'a', kind: 'footnote', text: '1' } }),
        P(ref({ name: 'a', format: 'text', kind: 'note', text: '1' })),
        { type: 'noteSection', content: [
          { type: 'note', attrs: { id: 'a', kind: 'footnote', label: null, text: '1' }, content: [T('The note.')] },
        ] },
      ],
    };
    const xml = await content(doc);
    expect(xml).toContain('<text:note-ref text:note-class="footnote" text:reference-format="text" text:ref-name="ftn1">1</text:note-ref>');

    const back = importOdt(await buildOdt(doc as any, DEFAULT_MARGINS, 'portrait')).content as unknown as N;
    const [r] = walk(back, 'crossRef');
    expect([r.attrs.kind, r.attrs.name]).toEqual(['note', 'ftn1']);
  });
});

describe('cross-reference formats in DOCX', () => {
  it('spells each format as its field switch', async () => {
    expect(instrs(await documentXml(headingDoc))).toEqual([
      'REF Head1 \\h',
      'PAGEREF Head1 \\h',
      'REF Head1 \\r \\h',
      'REF Head1 \\n \\h',
      'REF Head1 \\w \\h',
      'REF Head1 \\p \\h',
    ]);
  });

  it('leaves out the hyperlink switch and carries a number separator', async () => {
    const doc: N = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [T('Chapter', bm('Head1'))] },
        P(ref({ name: 'Head1', format: 'number-all-superior', sep: '-', link: false })),
      ],
    };
    expect(instrs(await documentXml(doc))).toEqual(['REF Head1 \\w \\d "-"']);
  });

  it('marks the note itself for a NOTEREF field', async () => {
    const doc: N = {
      type: 'doc',
      content: [
        P(T('Body'), { type: 'noteRef', attrs: { id: 'a', kind: 'footnote', text: '1' } }),
        P(ref({ name: 'a', format: 'text', kind: 'note', text: '1' })),
        { type: 'noteSection', content: [
          { type: 'note', attrs: { id: 'a', kind: 'footnote', label: null, text: '1' }, content: [T('The note.')] },
        ] },
      ],
    };
    const bytes = await buildDocx(doc as any, DEFAULT_MARGINS, 'portrait');
    const files = unzipSync(bytes);
    expect(instrs(strFromU8(files['word/document.xml']))).toEqual(['NOTEREF _Refa \\f \\h']);
    expect(strFromU8(files['word/footnotes.xml'])).toMatch(/<w:bookmarkStart w:id="\d+" w:name="_Refa"\/><w:r>[\s\S]*?<w:footnoteRef\/>[\s\S]*?<\/w:r><w:bookmarkEnd/);

    const back = importDocx(bytes).content as unknown as N;
    const [r] = walk(back, 'crossRef');
    expect([r.attrs.kind, r.attrs.format]).toEqual(['note', 'text']);
  });
});

describe('reading Word field switches', () => {
  const docxOf = (body: string) => zipSync({
    'word/document.xml': strToU8(`<?xml version="1.0"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`),
  });
  const field = (instr: string, shown: string) =>
    `<w:p><w:fldSimple w:instr="${instr}"><w:r><w:t>${shown}</w:t></w:r></w:fldSimple></w:p>`;

  it('reads the format, the separator and the missing hyperlink switch', () => {
    const back = importDocx(docxOf(
      field('REF _Ref1 \\w \\d &quot;-&quot;', '1-2-3') + field('REF _Ref1 \\p', 'above') + field('REF &quot;My mark&quot; \\n', '3'),
    )).content as unknown as N;
    expect(walk(back, 'crossRef').map((r) => [r.attrs.name, r.attrs.format, r.attrs.sep ?? null, r.attrs.link ?? true])).toEqual([
      ['_Ref1', 'number-all-superior', '-', false],
      ['_Ref1', 'direction', null, false],
      ['My mark', 'number-no-superior', null, false],
    ]);
  });
});
