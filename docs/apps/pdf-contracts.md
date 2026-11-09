# PDF contracts («Договоры в PDF»)

Category: docs. Directory: `src/extensions/pdf-contracts/`. No settings card (`settings: false`). Uses the cross-app
kind `reminder` («Напоминания»).

## What it does

A contract attached to the chat (or a path written in the request, `~/Documents/contract.pdf`) is read page by page,
and code finds: the parties («…, именуемое в дальнейшем «Заказчик»», «hereinafter referred to as …»), the number and
signing date, the price, payment terms (advance, days of payment and their kind, «не позднее» dates), the term,
auto-renewal, termination (unilateral withdrawal, notice), penalties (percent per day, the cap) and IP / licensing
(transfer of the exclusive right, simple / exclusive licence, free of charge). **Every field quotes one sentence of
the contract verbatim with its page** (and clause number), and `contract.verify` re-checks each quote against the
page text — tolerant only to spacing, line-break hyphens, quote marks, dashes and ё; a changed number or an invented
sentence is refused. The local model, when there is one, may add fields; only quotes found in the contract are kept
and the rest are counted on the card. Values (amounts, percents, days, dates) are parsed by code from the quote.

Deadlines from the quotes: the end of the term, the last day to refuse auto-renewal (end − notice), «не позднее»
payment dates and «в течение N рабочих дней с даты подписания» from the signing date (working days skip weekends —
marked «≈»). Each future deadline has «Напомнить» (kind `reminder`): «Напоминания» puts «Напомни 1 декабря 2026 в
10:00: договор «…»: последний день, чтобы отказаться от продления (стр. 2)» into the chat, which it parses and confirms
as any other reminder. A follow-up («какие штрафы в договоре?», «когда платить?») is answered from the card of the
contract already read in the chat, with quotes and pages.

«сравни с прошлой версией договора»: two PDFs attached, one attached and the contract read earlier in the chat, or the
two last read. The older version comes first by a version number or a date in the file names («v2», «ред. 3»,
2026-03-01), else in the order given; «Поменять местами» on the card. Clauses are paired by number and text
similarity (renumbered ones found by text), then diffed word by word; the card shows a clause map, the changed terms
(was → now) and each changed / added / removed clause with `del`/`ins`.

The card says once: «Это не юридическая консультация: Петя находит и цитирует условия, но не оценивает их.»

## Reading PDFs (`pdf.cjs`)

A small reader in plain Node: objects in file order (later definitions win), object streams, the page tree,
Flate / ASCIIHex / ASCII85 with PNG predictors, content streams with the text and graphics matrices, fonts with
ToUnicode CMaps (CID and simple fonts), WinAnsi / MacRoman / Standard encodings with Differences (uniXXXX, Cyrillic
`afii100xx` names), glyph widths for word spacing, Form XObjects and inline images. Runs are placed into lines by
position; a page with a clear vertical gutter is read column by column. Encrypted PDFs are refused with a message.
Checked by hand on PDFs from Chrome (Skia), LibreOffice and wkhtmltopdf (Qt).

Scanned pages (no text, a large image): the largest image is extracted (JPEG, JPEG 2000, 8-bit gray / RGB / indexed,
1-bit, CMYK; CCITT fax wrapped into a one-strip TIFF; JBIG2 unsupported) and read by a **local OCR only if one is
installed** — Tesseract in PATH, Homebrew, `/usr/local/bin` or `C:\Program Files\Tesseract-OCR` (`ocr.cjs`, `rus+eng`
when installed; the image goes to a private temporary folder and is deleted). Progress goes to the notification
center (`pdf-contracts:<doc id>`). Without OCR the card and the answer say which pages are scans and that their
terms were not read; OCR'd pages are marked and the card asks to check quotes against the scan.

An attachment without a path on disk falls back to the text Petya read when it was attached (`[Страница N]` markers);
the card says so. Fully scanned PDFs are refused by the attachment reader itself — write the path in the request to
use the OCR.

Read documents (pages and lines, not the PDFs) are kept in `<company folder>/pdf-contracts/<id>.json` (mode 600, the
newest 30) for follow-ups, «Показать на странице» (ipc `page`) and comparisons.

## Phrases

«разбери этот договор», «какие штрафы в договоре?», «когда можно отказаться от продления договора?», «что в
контракте по оплате», «кто стороны по договору», «сравни с прошлой версией договора», «сравни две версии договора»,
«разбери договор ~/Documents/contract.pdf». Without a file, only a clearly document request is claimed — to ask for
the PDF («разбери договор», «договор в PDF», «сравни версии договора»).

Near-misses (null / no offer): «у нас с Олегом договор: он ревьюит по пятницам», «какой договор с коллегой о
дежурствах», «мы договорились с Машей», «напиши / составь договор…», «договоримся на завтра», «какие условия договора
с командой», «подпиши договор», other documents.

## Verified

Unit `node tests/pdf-contracts.cjs` on PDFs generated by `tests/fixtures/pdf-contracts/make-pdf.cjs` (no binaries
committed: a Type0 font with ToUnicode, a simple font with Cyrillic glyph names, word-by-word placement, TJ kerning,
an object stream with a cross-reference stream, two columns, a scanned page, encryption): the reader, clauses and
fields with quotes and pages, quote checks, deadlines, the diff, routing and near-misses, the card, the model's
quotes checked, follow-ups, versions and swap, OCR present (stubbed) and absent, a text-only attachment, the
`reminder` provider through the reminders' own parser. UI `tests/pdf-contracts-ui.cjs` (screenshots
`petya-pdf-contracts.png`, `petya-pdf-contracts-terms.png`, `petya-pdf-contracts-diff.png`). The real Tesseract read
JPEG, Flate-gray and CCITT G4 scans made from a rendered contract by hand (not part of the tests).

Needs live checking: contracts from real counterparties (scanned with stamps, tables of payments, appendices, two
languages in columns), Type3 / custom-encoded fonts without ToUnicode, PDFs with incremental updates, a real
Tesseract on macOS / Windows paths and its speed on 20+ pages, and that a reminder request sent from the card is
confirmed by «Напоминания» in the live chat.
