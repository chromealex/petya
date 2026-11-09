# Tone check («Проверка тона»)

Category: comms. Local only (rules in code, suggestions from the local model), settings card (`settings: true`,
setting `extension_tone-check`). The first consumer of the outgoing-message pipeline
(`docs/foundations/outgoing.md`): `"provides": {"outgoing-check": "check.cjs"}`.

## What it does
- Before Petya sends a message on your behalf, the confirmation shows what may read badly for that audience, with
  the exact words marked and a softer or clearer variant: Slack («Попроси команду …», thread replies, report
  sharing), Discord, replies to store reviews and support tickets, mail reply drafts, PR comments.
  «Заменить на …» puts the variant into the field (visible, with «Вернуть»); «Отправить» always sends the field as
  it is. Nothing is changed or sent by itself.
- In the chat: «как это звучит: …», «не слишком резко: …», «проверь тон: …», «проверь тон ответа игроку: …»,
  «смягчи сообщение: …», «сделай помягче: …», «перепиши помягче: …». Without a message Petya asks for it in the
  shared question panel. The card shows the message with marked fragments, a calm ↔ harsh scale, the findings with
  «Заменить на …», and for «смягчи» a softer whole message («Взять этот вариант»); actions «Скопировать», send
  through a connected messenger (`share-message`: that app's own confirmation reviews it again), «Проверить снова».

## What it flags (`rules.cjs`)
| kind | examples | severity | mechanical fix |
| --- | --- | --- | --- |
| caps | «СРОЧНО», «КТО ОПЯТЬ СЛОМАЛ БИЛД» (acronyms like API, QA, PR, ASAP, task keys are not shouting) | warning; 3+ words problem | lower case, sentence-start capital |
| punctuation | «!!!», «?!» | info | one «!» / «?» |
| ultimatum | «в последний раз», «иначе …», «если до вечера не почините, будем откатывать», «не обсуждается», «немедленно» | problem | model |
| harsh | «бред», «ерунда», «кто это сделал», «вы опять ничего не …», «ужасно» | problem / warning | model |
| passive | «как я уже писал», «повторяю ещё раз», «в который раз», «неужели так сложно» | warning | «напомню» for some, else model |
| context | «как договорились», «см. выше», «тот баг» for a public channel or a customer; `@channel` / `@here`; internal task keys (`BW-123`) to a customer | info | — |
| unclear | a two-word post to a public channel, a sentence over 45 words (high only) | info | — |

A few English phrasings (as I said, or else, garbage…) are flagged too, because drafts to communities and stores
are often in English.

Sensitivity: **low** — harsh words, ultimatums, multi-word shouting; **medium** (default) — plus passive aggression,
single shouted words, «!!!», missing context for public/customer audiences, `@channel`; **high** — plus unclear text and
context for colleagues too.

## The model (`soften.cjs`)
Fragments without a mechanical fix go to the local model (`kit.modelJSON`) with the audience and the language; for
«смягчи» it also writes the whole message. A variant is kept only when it is **grounded**: it keeps every number,
time, link, `@mention`, `#channel`, task key and `code` of what it replaces, adds none that is not in the draft, is in
the draft's language and is not much longer. Otherwise the finding simply has no suggestion. Inside the send
pipeline the model gets 3.5 s of the check's 6 s budget, so the rules' findings always arrive; without a model the
check still flags everything and offers the mechanical fixes.

## Settings
`toneCheckSensitivity` (`low` / `medium` / `high`) and `toneCheckChannels` — which confirmations are checked
(`slack,discord,store-reviews,support,mail,github,other`; `other` covers apps added later; `none` when all are off).
Nothing leaves the computer.

## Decisions on near-misses
- «тон голоса Пети», «поменяй тон голоса», «как звучит мой голос» — Petya's voice settings, not this app.
- «проверь орфографию» — **not this app.** Spelling needs a dictionary and checks every word; mixed into tone
  findings it would bury the few that matter. It fits the same pipeline as a separate `outgoing-check` (e.g. a
  spelling app) and would show in the same confirmation. The tone check does not flag typos and does not claim
  spelling requests (they are in its `avoid`).
- «тонкий клиент», «тональность отзывов», «настроение игроков в дискорде», «смягчи свет в сцене» — not about a
  message's tone; «смягчи» counts only with a message named («сообщение», «текст», «ответ», …) or set off by «:».
- «отправь в Discord: …», «попроси команду …» — sending belongs to those apps; their confirmation is where the
  check runs.
An explicit tone request goes first among apps' chat turns (`claims(command)` in `feature.cjs`, honoured by
`src/features/extension-ui.cjs`): «как это звучит: кто сломал билд?» is about tone, not CI.

## Tests
- `node tests/tone-check.cjs` — rules by sensitivity and audience, grounding, model suggestions with a stubbed model
  (an invented fact and a wrong language are dropped), the check through the real pipeline (channels setting, not
  added, a hanging model within the budget), chat routing and near-misses, model-free answers, settings validation.
- `node tests/outgoing.cjs`, `node tests/extension-offers-matrix.cjs`.
- UI: `timeout 120 xvfb-run -a env PETYA_SMOKE_TEST=1 ./node_modules/electron/dist/electron --no-sandbox tests/tone-check-ui.cjs`
  — a real Discord confirmation reviewed by the real pipeline and check (findings, an applied suggestion with
  «Вернуть», re-review after edits, the exact field sent) and the chat card; screenshots
  `petya-tone-check-discord.png`, `petya-tone-check-card.png` in the temp folder.

## Verified live vs stubs
Everything here is local; the model's answers are stubbed in tests. To verify live: with a local model chosen, check
the quality of suggestions and rewrites in Russian and English and the 3.5 s budget on a slow machine; send a real
Slack/Discord message through a confirmation with findings.
