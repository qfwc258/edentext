# `src/lib/export/`

This directory writes ODF, DOCX, PDF, and browser downloads. `saveFile.ts` applies
password protection after each format-specific pass; templates follow the document format.

`buildOdt` is a DOM-free pipeline: TipTap JSON passes through `odf-kit`, then content and
style XML post-processing. ODF features `odf-kit` cannot express travel through sentinels;
their replacement passes are order-dependent. Preserve the pipeline order and cover new
sentinels in every relevant document, header/footer, table-cell, and note path.

The final ODT writes `mimetype` first and stored; already-compressed pictures stay stored
and remaining entries are deflated once. DOCX post-pack passes that add parts must also add
relationships and content types. Keep schema-sensitive XML order intact.

Headings and body defaults must match the importers and `HEADING_STYLE_OVERRIDES`. Emit
named styles and direct formatting separately so values matching product defaults remain
implicit. `saveDocument` settles the format before constructing bytes; do not infer it from
the browser save dialog.

Read `docs/architecture/export.md` before changing ODF/DOCX export, post-pack passes,
sentinels, heading defaults, review printing, or header/footer export. Read the focused
architecture document for tables, frames, formulas, formatting, notes, or encryption.
