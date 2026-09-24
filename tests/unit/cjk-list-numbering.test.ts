import { describe, it, expect } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { buildDocx } from '../../src/lib/export/docx';
import { importDocx } from '../../src/lib/import/docx';
import { buildOdt } from '../../src/lib/export/odt';
import { importOdt } from '../../src/lib/import/odt';

// The four numbering styles Chinese documents actually use. Every spelling below was read
// out of LibreOffice: a .docx carrying one w:numFmt per list, converted both ways.
const KEYS = ['cjk-counting', 'cjk-legal', 'cjk-stem', 'circled-decimal'] as const;
const MARGINS = { top: 2, bottom: 2, left: 2, right: 2 } as never;

const docOf = (key: string) => ({
  type: 'doc',
  content: [{
    type: 'orderedList',
    attrs: { listStyleType: key },
    content: [
      { type: 'listItem', content: [{ type: 'paragraph', attrs: {}, content: [{ type: 'text', text: 'one' }] }] },
      { type: 'listItem', content: [{ type: 'paragraph', attrs: {}, content: [{ type: 'text', text: 'two' }] }] },
    ],
  }],
});

const listKey = (doc: unknown) =>
  ((doc as { content?: { attrs?: { listStyleType?: string } }[] }).content?.[0].attrs ?? {}).listStyleType;

describe('Chinese list numbering', () => {
  it('names the Word formats LibreOffice writes for them', async () => {
    const want: Record<string, string> = {
      'cjk-counting': 'chineseCountingThousand',
      'cjk-legal': 'chineseLegalSimplified',
      'cjk-stem': 'ideographTraditional',
      'circled-decimal': 'decimalEnclosedCircle',
    };
    for (const key of KEYS) {
      const files = unzipSync(await buildDocx(docOf(key) as never, MARGINS, 'portrait'));
      expect(strFromU8(files['word/numbering.xml']), key).toContain(`w:numFmt w:val="${want[key]}"`);
    }
  });

  // LibreOffice spells these as the whole sequence, not as one character — a bare 一 is
  // dropped back to decimal on the next save.
  it('names the ODF formats as the sequence', async () => {
    const files = unzipSync(await buildOdt(docOf('cjk-counting') as never, MARGINS, 'portrait'));
    const xml = strFromU8(files['content.xml']) + strFromU8(files['styles.xml']);
    expect(xml).toContain('style:num-format="一, 二, 三, ..."');
    expect(xml).toContain('style:num-suffix="、"');
  });

  it('round-trips through both formats', async () => {
    for (const key of KEYS) {
      expect(listKey(importDocx(await buildDocx(docOf(key) as never, MARGINS, 'portrait')).content), key).toBe(key);
      expect(listKey((await importOdt(await buildOdt(docOf(key) as never, MARGINS, 'portrait'))).content), key).toBe(key);
    }
  });
});
