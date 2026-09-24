// A list level's indent: Word's w:lvl/w:pPr/w:ind w:left, ODF's label-alignment
// fo:margin-left. Both are absolute, the editor nests one step per level, so the attr
// is the step past the level above.
import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { buildOdt } from '../../src/lib/export/odt';
import { buildDocx } from '../../src/lib/export/docx';
import { importOdt } from '../../src/lib/import/odt';
import { importDocx } from '../../src/lib/import/docx';

type N = any;

const item = (text: string, sub?: N): N =>
  ({ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }, ...(sub ? [sub] : [])] });

// Level 1 sits 0.5cm right of the base, level 2 0.6cm left of its own base.
const doc: N = {
  type: 'doc',
  content: [
    { type: 'bulletList', attrs: { indent: 0.5 }, content: [
      item('one', { type: 'bulletList', attrs: { indent: -0.6 }, content: [item('nested')] }),
      item('two'),
    ] },
  ],
};

const margins = { top: 2, bottom: 2, left: 2, right: 2 };
const lists = (d: N) => {
  const top = d.content!.find((n: N) => n.type === 'bulletList') as N;
  return [top, top.content[0].content[1]];
};

describe('list level indents', () => {
  it('round-trips a per-level indent through ODF', async () => {
    const [top, nested] = lists((await importOdt(await buildOdt(doc, margins, 'portrait'))).content);
    expect(top.attrs?.indent).toBeCloseTo(0.5, 2);
    expect(nested.attrs?.indent).toBeCloseTo(-0.6, 2);
  });

  it('round-trips a per-level indent through DOCX', async () => {
    const [top, nested] = lists(importDocx(await buildDocx(doc, margins, 'portrait')).content);
    expect(top.attrs?.indent).toBeCloseTo(0.5, 2);
    expect(nested.attrs?.indent).toBeCloseTo(-0.6, 2);
  });

  // Word resolves a paragraph's own w:ind over the numbering level's, and a document
  // whose items say 357tw against a level's 720tw is indented half as far as the level.
  it('takes a DOCX item\u2019s own w:ind over the level\u2019s', () => {
    const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
    const item357 = '<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>'
      + '<w:ind w:left="357" w:hanging="357"/></w:pPr><w:r><w:t>own indent</w:t></w:r></w:p>';
    const files = {
      '[Content_Types].xml': strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        + '<Default Extension="xml" ContentType="application/xml"/></Types>'),
      'word/numbering.xml': strToU8(`<?xml version="1.0"?><w:numbering ${W}>`
        + '<w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/>'
        + '<w:lvlText w:val="\u2022"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum>'
        + '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>'),
      'word/document.xml': strToU8(`<?xml version="1.0"?><w:document ${W}><w:body>${item357}</w:body></w:document>`),
    };
    const back: N = importDocx(zipSync(files) as Uint8Array).content;
    // 0.63cm, one editor step (1.27cm) less than the level's own base.
    expect(back.content[0].attrs?.indent).toBeCloseTo(0.63 - 1.27, 2);
  });

  it('leaves an ordinary list unindented in both formats', async () => {
    const plain: N = { type: 'doc', content: [
      { type: 'bulletList', content: [item('one', { type: 'bulletList', content: [item('nested')] })] },
    ] };
    for (const back of [
      (await importOdt(await buildOdt(plain, margins, 'portrait'))).content,
      importDocx(await buildDocx(plain, margins, 'portrait')).content,
    ]) {
      for (const list of lists(back)) expect(list.attrs?.indent ?? null).toBeNull();
    }
  });
});
