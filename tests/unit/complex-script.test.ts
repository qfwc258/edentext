import { describe, it, expect } from 'vitest';
import { zipSync, strToU8, unzipSync, strFromU8 } from 'fflate';
import { importOdt } from '../../src/lib/import/odt';
import { buildOdt } from '../../src/lib/export/odt';
import { buildDocx } from '../../src/lib/export/docx';
import { importDocx } from '../../src/lib/import/docx';
import { parseRunProps, W } from '../../src/lib/import/docxStyles';

// A style carries western, asian and complex-script fonts side by side; text is set from
// the set its own script belongs to. Probed against LibreOffice: a Hebrew paragraph whose
// style declares only style:font-size-complex="16pt" is set at 16pt, and CJK likewise.
const NS =
  'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" ' +
  'xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" ' +
  'xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" ' +
  'xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" ' +
  'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"';

const HEBREW = 'אֵ֣לֶּה הַדְּבָרִ֗ים';
const CHINESE = '这是中文文本';

// One style declaring both sets, so each run has to pick the one its script belongs to.
function odt(): Uint8Array {
  const styles = `<?xml version="1.0"?><office:document-styles ${NS}>
   <office:font-face-decls>
    <style:font-face style:name="Taamey D" svg:font-family="'Taamey D'"/>
    <style:font-face style:name="Noto Sans CJK SC" svg:font-family="'Noto Sans CJK SC'"/>
   </office:font-face-decls><office:styles>
   <style:default-style style:family="paragraph">
    <style:text-properties fo:font-size="12pt" fo:font-family="Liberation Serif"
     style:font-size-complex="12pt" style:font-size-asian="12pt"/>
   </style:default-style>
   <style:style style:name="Standard" style:family="paragraph"/>
   <style:style style:name="Chapter" style:family="paragraph" style:parent-style-name="Standard">
    <style:text-properties style:font-size-complex="16pt" style:font-name-complex="Taamey D"
     style:font-size-asian="14pt" style:font-name-asian="Noto Sans CJK SC"/>
   </style:style>
  </office:styles></office:document-styles>`;
  const content = `<?xml version="1.0"?><office:document-content ${NS}><office:body><office:text>
   <text:p text:style-name="Chapter">${HEBREW}<text:span>verse 2</text:span></text:p>
   <text:p text:style-name="Chapter">${CHINESE}<text:span>latin tail</text:span></text:p>
  </office:text></office:body></office:document-content>`;
  return zipSync({ 'content.xml': strToU8(content), 'styles.xml': strToU8(styles) });
}

type Run = { text: string; marks?: { type: string; attrs?: Record<string, unknown> }[] };
type Doc = { content?: { content?: Run[] }[] };
const runs = (doc: Doc, block = 0) => doc.content?.[block].content ?? [];
const textStyle = (r: Run) => r.marks?.find((m) => m.type === 'textStyle')?.attrs ?? {};

describe('script-dependent run properties', () => {
  it('sets a Hebrew run from the -complex font and size, a Latin one from the western', () => {
    const [hebrew, latin] = runs(importOdt(odt()).content);
    expect(textStyle(hebrew)).toMatchObject({ fontSize: '16pt', fontFamily: 'Taamey D' });
    // The style leaves the western pair at the default, so the Latin run takes no mark.
    expect(latin.text).toBe('verse 2');
    expect(textStyle(latin).fontSize).toBeUndefined();
    expect(textStyle(latin).fontFamily).toBeUndefined();
  });

  it('sets a CJK run from the -asian font and size, a Latin one from the western', () => {
    const [chinese, latin] = runs(importOdt(odt()).content, 1);
    expect(textStyle(chinese)).toMatchObject({ fontSize: '14pt', fontFamily: 'Noto Sans CJK SC' });
    expect(latin.text).toBe('latin tail');
    expect(textStyle(latin).fontSize).toBeUndefined();
    expect(textStyle(latin).fontFamily).toBeUndefined();
  });

  it('keeps both sizes through an export and back', async () => {
    const doc = importOdt(odt()).content;
    const again = importOdt(await buildOdt(doc as never));
    expect(textStyle(runs(again.content)[0])).toMatchObject({ fontSize: '16pt', fontFamily: 'Taamey D' });
    expect(textStyle(runs(again.content, 1)[0]))
      .toMatchObject({ fontSize: '14pt', fontFamily: 'Noto Sans CJK SC' });
  });
});

// DOCX carries the asian font alone (w:rFonts w:eastAsia); the format has no asian size
// or weight, and the choice is per w:r rather than per text node.
const CT = `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;
const RELS = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
const WNS = `xmlns:w="${W}"`;
const RFONTS = '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="SimSun"/>';
const run = (text: string) => `<w:r><w:rPr>${RFONTS}</w:rPr><w:t>${text}</w:t></w:r>`;

const docx = () => zipSync({
  '[Content_Types].xml': strToU8(CT),
  '_rels/.rels': strToU8(RELS),
  'word/document.xml': strToU8(`<?xml version="1.0"?><w:document ${WNS}><w:body>
    <w:p>${run(CHINESE)}${run('latin tail')}</w:p>
  </w:body></w:document>`),
});

const rPr = (inner: string) =>
  new DOMParser().parseFromString(`<w:rPr ${WNS}>${inner}</w:rPr>`, 'application/xml').documentElement;

describe('DOCX east-asian run font', () => {
  it('keeps w:eastAsia alongside the ascii font', () => {
    expect(parseRunProps(rPr(RFONTS))).toMatchObject({ font: 'Times New Roman', fontEastAsia: 'SimSun' });
  });

  it('sets a CJK run from it and leaves a Latin run on the ascii font', () => {
    const [chinese, latin] = runs(importDocx(docx()).content as Doc);
    expect(textStyle(chinese).fontFamily).toBe('SimSun');
    expect(latin.text).toBe('latin tail');
    expect(textStyle(latin).fontFamily).not.toBe('SimSun');
  });
});

// The text box serializes its runs by hand, so it has to write the same four rFonts
// attributes the library writes for the body.
const MARGINS = { top: 2, bottom: 2, left: 2, right: 2 } as never;
const boxDoc = {
  type: 'doc',
  content: [{
    type: 'paragraph',
    attrs: {},
    content: [{
      type: 'textBox',
      attrs: { width: 300, height: 200 },
      content: [{
        type: 'paragraph',
        attrs: {},
        content: [{
          type: 'text',
          text: CHINESE,
          marks: [{ type: 'textStyle', attrs: { fontFamily: 'SimSun' } }],
        }],
      }],
    }],
  }],
};

describe('DOCX text box run font', () => {
  it('names the font as the east-asian one too', async () => {
    const files = unzipSync(await buildDocx(boxDoc as never, MARGINS, 'portrait'));
    const xml = strFromU8(files['word/document.xml']);
    const inBox = xml.slice(xml.indexOf('<w:txbxContent>'));
    expect(inBox).toContain('w:eastAsia="SimSun"');
  });

  it('round-trips the font of its CJK run', async () => {
    const back = importDocx(await buildDocx(boxDoc as never, MARGINS, 'portrait'));
    const box = (back.content as Doc).content?.[0].content?.[0] as unknown as Doc;
    expect(textStyle(runs(box)[0])).toMatchObject({ fontFamily: 'SimSun' });
  });
});

// Both formats keep language three ways (western / asian / complex), and both word
// processors read Chinese, Japanese and Korean text from the asian one alone. A document
// that says "zh-CN" in the western slot says it where nobody looks.
const ZH = { language: 'zh', country: 'CN' };
const zhDoc = {
  type: 'doc',
  content: [{ type: 'paragraph', attrs: {}, content: [{ type: 'text', text: CHINESE }] }],
};

describe('East Asian document language', () => {
  it('writes the DOCX document default into w:eastAsia, with a Han default font', async () => {
    const files = unzipSync(await buildDocx(zhDoc as never, MARGINS, 'portrait', undefined, ZH));
    const xml = strFromU8(files['word/styles.xml']);
    expect(xml).toContain('w:eastAsia="zh-CN"');
    expect(xml).not.toContain('<w:lang w:val="zh-CN"');
    expect(xml).toMatch(/<w:rFonts[^>]*w:eastAsia="SimSun"/);
  });

  it('writes the ODT document default into the asian slot', async () => {
    const files = unzipSync(await buildOdt(zhDoc as never, MARGINS, 'portrait', undefined, ZH));
    const xml = strFromU8(files['styles.xml']);
    expect(xml).toContain('style:language-asian="zh"');
    expect(xml).toContain('style:country-asian="CN"');
    expect(xml).not.toContain('fo:language="zh"');
    expect(xml).toContain('style:font-name-asian="SimSun"');
  });

  it('reads the asian slot back in both formats', async () => {
    expect((await importOdt(await buildOdt(zhDoc as never, MARGINS, 'portrait', undefined, ZH))).language).toBe('zh-CN');
    expect(importDocx(await buildDocx(zhDoc as never, MARGINS, 'portrait', undefined, ZH)).language).toBe('zh-CN');
  });

  // A run's own language travels the same way, and a western one is untouched by it.
  it('keeps a run language in the slot its script belongs to', async () => {
    const mixed = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        attrs: {},
        content: [
          { type: 'text', text: CHINESE, marks: [{ type: 'textStyle', attrs: { lang: 'zh-TW' } }] },
          { type: 'text', text: 'english', marks: [{ type: 'textStyle', attrs: { lang: 'en-GB' } }] },
        ],
      }],
    };
    const xml = strFromU8(unzipSync(await buildDocx(mixed as never, MARGINS, 'portrait'))['word/document.xml']);
    expect(xml).toContain('w:eastAsia="zh-TW"');
    expect(xml).toContain('w:val="en-GB"');

    const back = await importOdt(await buildOdt(mixed as never, MARGINS, 'portrait'));
    expect(textStyle(runs(back.content as Doc)[0])).toMatchObject({ lang: 'zh-TW' });
    expect(textStyle(runs(back.content as Doc)[1])).toMatchObject({ lang: 'en-GB' });
  });
});
