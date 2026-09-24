// Word stores two hyphens as elements rather than characters. Dropping them loses a
// character the line is measured with — a document converted from PDF carries dozens.
import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { importDocx } from '../../src/lib/import/docx';

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

const build = (run: string) => importDocx(zipSync({
  '[Content_Types].xml': strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
  'word/document.xml': strToU8(`<?xml version="1.0"?><w:document ${W}><w:body>`
    + `<w:p><w:r><w:t>text</w:t>${run}<w:t>only</w:t></w:r></w:p></w:body></w:document>`),
}) as Uint8Array);

const text = (r: any) => (r.content.content[0].content as any[]).map((n) => n.text).join('');

describe('DOCX hyphen elements', () => {
  it('reads w:noBreakHyphen as a non-breaking hyphen', () => {
    expect(text(build('<w:noBreakHyphen/>'))).toBe('text\u2011only');
  });

  it('reads w:softHyphen as a soft hyphen', () => {
    expect(text(build('<w:softHyphen/>'))).toBe('text\u00adonly');
  });
});
