import { t } from '../i18n/i18n.svelte';
import type { TemplateData, TemplateEntry } from './types';
import { BOLD, LINE_PT, MM_TO_PT, P, PLH, RETURN_SPACE_AFTER_PT, SMALL, T, dateField } from './builders';

// Personal letter on the DIN 5008 window-envelope geometry: same 45mm address field
// and fold marks as Form B, but no info block — just a right-aligned place/date line.

// 45mm target − 20mm margin − the three sender-address lines.
const RETURN_SPACE_BEFORE_PT = Math.round((45 - 20) * MM_TO_PT - 3 * LINE_PT);

function buildLetter(): TemplateData {
  const L = t().templates.letter;
  return {
    margins: { top: 2, bottom: 2, left: 2.5, right: 2 },
    foldMarks: true,
    content: {
      type: 'doc',
      content: [
        P(null, PLH(L.recipientName)),
        P(null, PLH(L.recipientStreet)),
        P(null, PLH(L.recipientCity)),
        // The one-line return address opens the address field at 45mm from the top.
        // fontSize also shrinks the paragraph mark, so the line box is 8pt tall.
        P({ spaceBefore: RETURN_SPACE_BEFORE_PT, spaceAfter: RETURN_SPACE_AFTER_PT, fontSize: '8pt' }, PLH(L.returnAddress, SMALL)),
        P(null, PLH(L.recipientName)),
        P(null, PLH(L.recipientStreet)),
        P(null, PLH(L.recipientCity)),
        P(null),
        P({ textAlign: 'right' }, PLH(L.place), T(', '), dateField()),
        P(null),
        P(null),
        P(null, PLH(L.subject, BOLD)),
        P(null),
        P(null, PLH(L.salutation)),
        P(null),
        P(null, PLH(L.bodyText)),
        P(null),
        P(null, T(L.closing)),
        P(null),
        P(null),
        P(null),
        P(null, PLH(L.signature)),
      ],
    },
  };
}

export const privateLetter: TemplateEntry = {
  id: 'privateLetter',
  name: () => t().templates.privateLetter.name,
  description: () => t().templates.privateLetter.description,
  build: buildLetter,
};
