import { t } from '../i18n/i18n.svelte';
import type { TemplateData, TemplateEntry } from './types';
import { BOLD, P, PLH, T, dateField } from './builders';

// US business letter in block format: every line flush left, no indents and no
// window-envelope geometry, so the date carries a full line above the inside
// address. Letter paper with the conventional 1in margins.

function buildLetter(): TemplateData {
  const L = t().templates.letter;
  return {
    format: 'letter',
    margins: { top: 2.54, bottom: 2.54, left: 2.54, right: 2.54 },
    content: {
      type: 'doc',
      content: [
        P(null, PLH(L.companyName, BOLD)),
        P(null, PLH(L.returnAddress)),
        P(null),
        P(null, dateField()),
        P(null),
        P(null, PLH(L.recipientName)),
        P(null, PLH(L.recipientCompany)),
        P(null, PLH(L.recipientStreet)),
        P(null, PLH(L.recipientCity)),
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

export const usLetter: TemplateEntry = {
  id: 'usLetter',
  name: () => t().templates.usLetter.name,
  description: () => t().templates.usLetter.description,
  build: buildLetter,
};
