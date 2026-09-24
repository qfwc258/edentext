// A dated running head: the date/time field in a header/footer zone. ODF keeps every
// zone in styles.xml, so its fields resolve there rather than in content.xml.
import { describe, it, expect } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { buildOdt } from '../../src/lib/export/odt';
import { importOdt } from '../../src/lib/import/odt';
import { buildDocx } from '../../src/lib/export/docx';
import { importDocx } from '../../src/lib/import/docx';
import { EMPTY_HF_SET } from '../../src/lib/storage/headerFooter';

type N = any;

const doc: N = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Body' }] }] };
const dateNode = (): N => ({
  type: 'dateTimeField',
  attrs: { kind: 'date', format: 'DD.MM.YYYY', fixed: true, value: '2026-03-04T00:00:00' },
});
const zone = (...content: N[]): N => ({ type: 'doc', content: [{ type: 'paragraph', content }] });
const hf = {
  header: zone({ type: 'text', text: 'Stand: ' }, dateNode()),
  footer: null,
  headerFirst: null, footerFirst: null, differentFirstPage: false,
  headerEven: null, footerEven: null, differentOddEven: false,
  pageCount: 1,
};
const kindsOf = (d: N) => (d?.content?.[0]?.content ?? []).map((n: N) => n.type);

describe('a date field in a header', () => {
  it('rides styles.xml as a live ODF field and comes back', async () => {
    const bytes = await buildOdt(doc, undefined, 'portrait', hf);
    const files = unzipSync(bytes);
    const styles = strFromU8(files['styles.xml']);
    expect(styles).toContain('<text:date text:date-value="2026-03-04');
    expect(styles).toContain('text:fixed="true"');
    expect(styles).toContain('xmlns:number=');
    expect(styles).toContain('<number:date-style');
    // The sentinel is gone, and nothing leaked into the body.
    expect(styles).not.toMatch(/[-]/);
    expect(strFromU8(files['content.xml'])).not.toContain('<text:date');

    const back = await importOdt(bytes);
    expect(kindsOf(back.header)).toEqual(['text', 'dateTimeField']);
    expect(back.header?.content?.[0]?.content?.[1]?.attrs?.kind).toBe('date');
  });

  it('resolves in a first-page zone too, which is written as raw XML', async () => {
    const bytes = await buildOdt(doc, undefined, 'portrait', {
      ...hf,
      differentFirstPage: true,
      headerFirst: zone(dateNode()),
    });
    const styles = strFromU8(unzipSync(bytes)['styles.xml']);
    expect(styles).toMatch(/<style:header-first>[\s\S]*<text:date /);
  });

  it('resolves in the zone of a section past the first', async () => {
    const body: N = { type: 'doc', content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'One' }] },
      { type: 'paragraph', attrs: { sectionBreak: true }, content: [{ type: 'text', text: 'Two' }] },
    ] };
    const bytes = await buildOdt(body, undefined, 'portrait', {
      ...hf,
      header: null,
      sections: [{ ...EMPTY_HF_SET }, { ...EMPTY_HF_SET, header: zone(dateNode()) }],
      pageCount: 2,
    });
    const styles = strFromU8(unzipSync(bytes)['styles.xml']);
    expect(styles).toContain('<text:date text:date-value="2026-03-04');
    expect(styles).not.toMatch(/\u0001DTF|DTF\d+DTF/);

    const back = await importOdt(bytes);
    expect(kindsOf(back.hfSections?.[1]?.header)).toEqual(['dateTimeField']);
  });

  // Word has no fixed date field, so only an auto one survives as a field there.
  it('rides the DOCX header field and comes back', async () => {
    const auto = { ...hf, header: zone({ type: 'text', text: 'Stand: ' }, { ...dateNode(), attrs: { ...dateNode().attrs, fixed: false } }) };
    const back = importDocx(await buildDocx(doc, undefined, 'portrait', auto));
    expect(kindsOf(back.header)).toEqual(['text', 'dateTimeField']);
  });
});
