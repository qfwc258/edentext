// Where a floating frame hangs in the text. ODF's paragraph anchor names the paragraph
// alone, so Writer writes such a frame back as the paragraph's *first* child — an image
// floated beside the last words of a paragraph came back before its first. The character
// anchor is the one that names a place, and it keeps the frame where it was.
import { describe, it, expect } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { buildOdt } from '../../src/lib/export/odt';

type N = any;

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNwaDgAAAKEAYEml6crAAAAAElFTkSuQmCC';
const margins = { top: 2, bottom: 2, left: 2, right: 2 };
const para = (...content: N[]): N => ({ type: 'paragraph', content });
const anchors = (xml: string) => [...xml.matchAll(/text:anchor-type="([^"]+)"/g)].map((m) => m[1]);

describe('a floating frame\'s anchor', () => {
  it('is the character it sits on, an inline one the text flow', async () => {
    const doc: N = {
      type: 'doc',
      content: [
        para({ type: 'text', text: 'beside' }, { type: 'image', attrs: { src: PNG, width: 200, height: 120, wrap: 'right' } }),
        para({ type: 'text', text: 'in line' }, { type: 'image', attrs: { src: PNG, width: 60, height: 40 } }),
        para({ type: 'textBox', attrs: { width: 200, height: 100, wrap: 'left' }, content: [para({ type: 'text', text: 'box' })] }),
      ],
    };
    const xml = strFromU8(unzipSync(await buildOdt(doc, margins, 'portrait'))['content.xml']);
    expect(anchors(xml)).toEqual(['char', 'as-char', 'char']);
    // And it is written where it sits: after the text it was floated beside.
    expect(xml).toContain('beside<draw:frame');
  });
});
