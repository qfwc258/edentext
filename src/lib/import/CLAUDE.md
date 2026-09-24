# `src/lib/import/`

This directory imports ODF and DOCX into the TipTap schema; `imageFormats.ts` is shared.
Password-protected files are decrypted before either importer runs.

`importLimits.ts` bounds ZIP input to 128 MiB compressed, 10,000 entries, 32 MiB XML parts,
64 MiB media parts, 64 MiB other entries, 256 MiB total expansion, and a 1000:1 ratio before
extraction; it rejects over-budget archives and XML declaring entities. A doctype naming
only an external DTD is dropped and the part read — old formula objects carry one — and a
part an embedded object points at never fails the document, only its own frame.
TIFF conversion also rejects more than 100 frames, 40 million pixels, or 160 MiB decoded RGBA
before it allocates an image buffer; unsupported images retain the importer's placeholder path.

ODF is parsed directly from `content.xml` and `styles.xml`; the library reader loses
structures the editor needs. Choose the importer from the extension, but retry the other
format after a failed parse so renamed files still open. Return unsupported content as
warnings where it can be safely flattened or omitted.

`StyleResolver` resolves named and automatic ODF styles through their parent chains;
`DocxStyles` provides the equivalent DOCX resolution. Keep only values that differ from
the resolved named style as direct formatting. Values equal to LibreOffice-compatible
editor defaults must remain implicit, or each round trip accumulates formatting.

Fit imported content to the editor schema without changing its semantic role: paragraph,
heading, list, table, frame, note, and field paths have separate constraints. Keep ODF and
DOCX behavior aligned unless the formats expose an unavoidable difference.

Both formats carry western, asian and complex-script text properties side by side, and a
run's font and size come from the set its own characters belong to (`scriptProps` in
`odt.ts`, `ASIAN_SCRIPT_RE`). The choice is per ODF text node and per DOCX run, so a run
mixing Latin and CJK takes the asian font throughout; DOCX has an asian font name only
(`w:rFonts w:eastAsia`), no asian size or weight, and its complex-script set is not read.

A header/footer zone is one paragraph, so a **text box** anchored in one has no block to
live in: ODF makes its paragraphs lines of the zone, DOCX trails its text on the zone's
own line behind a tab at the stop the box's anchor asks for. Dropping the box whole loses
what Word's page-number gallery puts there — a PAGE field, on every page of the document.

The `sectionBreak` marker is **ordinal** — the editor counts the blocks carrying it to
index the header/footer sets — and only a paragraph, a heading, a table or an index
carries it (`SECTION_CARRIERS`, the types `pageBreak.ts` gives the attr to). A group opening
with anything else is not modelled as a section at all and its set is dropped with it:
marking a later block would leave two sections on one page, and dropping only the marker
would shift every section after it onto the page setup of the one before.
`tests/corpus/17-sections.docx` (opening with a heading), `18-table-sections.docx` (with a
table) and `19-index-sections.docx` (with an index) hold the shapes that have to keep
working. A section can also **end inside a block-level `w:sdt`**: Word wraps an index in
one and puts the `sectPr` on the control's own last paragraph, where a walk of the body's
children never reaches it (`closingSectPr`). Missing it merges two sections, so the index
keeps the page setup of the section before and opens on its page rather than a new one.

ODF keeps a section's master page on the **first thing on its page**, which for a table is
its own table style and for an index its first body paragraph — both probed against
LibreOffice's own conversion. So `masterPageOf` walks the table family too, and naming a
master is a page break there as it is on a paragraph.

Direct paragraph properties beat the numbering level's: a list item's own `w:ind w:left`
is the list's indent, and a table's `w:tblW w:type="pct"` its width as a share of the
section's text width — the grid is only the columns' weights there, and reading it as a
width collapses a full-width table to a few millimetres.

Read `docs/architecture/import.md` before changing parsing, style resolution, default
suppression, image conversion, headers/footers, or format-specific edge cases. Read the
focused architecture document for tables, frames, formulas, formatting, notes, or encryption.

Exercise `npm test` for importer changes; use `npm run test:lo` for format I/O changes.
