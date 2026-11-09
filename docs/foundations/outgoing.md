# Outgoing-message pipeline

Every place where Petya sends text on the user's behalf — after the user's confirmation — passes the draft
through one pipeline before the confirmation is shown. Registered checks return findings; the confirmation shows
them and lets the user apply a suggestion or send as is.

Module: `src/features/outgoing.cjs` (feature `outgoing`, service `s.outgoing`, renderer IPC
`window.petya.feature('outgoing','review',draft)`). Renderer widget: `k.outgoingReview` in `src/ui/result-kit.js`.

## Two rules

1. **Never block sending.** A check that is slow (over its budget), throws or returns garbage is skipped
   (`review.skipped`); `review()` never throws. The send button of a confirmation is never disabled by findings.
2. **Never change text silently.** Checks get a deep-frozen copy of the draft; `review()` returns the text it was
   given. Text changes only through `apply(text, finding)` with a finding the user chose, and only when the span is
   still where the finding saw it (otherwise `null` — review again). The renderer shows every applied change with
   «Вернуть».

## Draft

```js
outgoing.review({
  text,                                   // exactly what would be sent
  channel: {service, target, audience},   // 'slack' | 'discord' | 'store-reviews' | 'support' | 'mail' | 'github' | …
                                          // target: '#general', 'Google Play', 'owner/repo#12'…
                                          // audience: 'public' | 'team' | 'direct' | 'customer' (default 'team')
  language,                               // 'ru' | 'en' | …; detected from the letters when omitted
  context                                 // plain JSON (rating, thread: true…), trimmed
}) → {text, channel, language, findings, checked:[ids], skipped:[{id, name, reason:'timeout'|'error'}], ms}
```

## Registering a check

An extension declares in its `extension.json`

```json
"provides": {"outgoing-check": "check.cjs"}
```

(the kind is in `REGISTRIES` of `src/features/app-links.cjs`; files are read by its `scan`), and the file exports:

```js
module.exports={
  id: 'tone-check',            // default: the extension id
  name: 'Проверка тона',       // shown next to findings
  order: 100,                  // lower runs and is listed first (default 1000)
  timeoutMs: 6000,             // own budget, clamped to 200..8000 ms (default 4000)
  ready: settings => bool,     // optional; the registry also requires the extension to be added
  fits: (channel, settings) => bool,   // optional: which channels it checks
  async check(services, draft) { return [finding, …]; }
};
```

All ready checks that fit the channel run in parallel. Results are ordered by check (`order`, then id) and,
inside a check, by place in the text (whole-message remarks last); identical findings are dropped; at most 30.

A check that uses the local model should degrade inside its own budget (race the model against a shorter timer and
return its rule-based findings) — otherwise the pipeline skips the whole check when the model is slow.

## Finding

```js
{severity: 'info' | 'warning' | 'problem',   // anything else → 'warning'
 span: {start, end, text} | {text} | null,    // offsets into draft.text; `text` alone is placed at its occurrence
 message: 'Звучит как ультиматум.',           // required, one line
 suggestion?: 'replacement for the span',     // '' removes the span; without a span: replaces the whole text
 kind?: 'ultimatum'}                          // free-form label for the check's own UI
```

The pipeline normalizes it to `{id, provider, providerName, severity, span|null, message, suggestion?, kind?}`.
A span whose offsets do not hold its text is re-placed by its text; if it cannot be placed, the finding stays as a
remark without a span and **its suggestion is dropped** (it must never become a whole-text rewrite).

## Helpers

- `apply(text, finding)` → new text or `null` (span gone or ambiguous); throws for a finding without a suggestion.
- `applyAll(text, findings)` → `{text, applied:[ids]}`: span suggestions only, non-overlapping, never whole rewrites.
- `confirmation(review)` → plain lines «Проверка перед отправкой: • «span» — message → «suggestion»» for text-only
  confirmations (the shared question panel).
- `language(text)` → `'ru' | 'en' | ''`.
- Main-process code that is not a feature calls the module-level `require('./features/outgoing.cjs').review(draft)`;
  before the feature is set up it finds nothing.

## Wiring a confirmation

Card editors (renderer):

```js
box.append(label, area);
if(k.outgoingReview)box.append(k.outgoingReview(area,{channel:{service:'discord',target:'#'+name,audience:'public'}}));
box.append(actionsRow);   // «Отправить» reads area.value at the press, as before
```

The widget reviews when shown and after edits (debounced), applies suggestions by dispatching `input` on the
textarea (so editors' counters update), and hides itself when there is nothing to show or the review fails. Set the
textarea programmatically? Dispatch `input` so it re-reviews.

Question-panel confirmations (main process): await the review with a budget, append `confirmation(review)` to the
question, and when `applyAll` changes something offer «Применить правки», which shows **a new confirmation** with
the edited text (applying is never sending). See `src/slack-request.cjs`.

## Where it is wired

| Flow | Where | service · audience |
| --- | --- | --- |
| Slack «Попроси команду …» (and share-message → Slack) | `src/slack-request.cjs` (question panel) | slack · public / team (private channel) |
| Slack reply in a thread | `src/extensions/slack/message-cards.js` | slack · team |
| Slack report sharing | `src/ui/report-share.js` | slack · team |
| Discord compose and FAQ replies (and share-message → Discord) | `src/extensions/discord/discord-cards.js` | discord · public |
| Replies to store reviews | `src/extensions/store-reviews/reviews-cards.js` | store-reviews · public |
| Support ticket replies | `src/extensions/support/support-cards.js` | support · customer |
| Mail reply drafts (opened in the mail service) | `src/extensions/mail/mail-cards.js` | mail · direct |
| PR comments | `src/extensions/pull-requests/pr-cards.js` | github · team |
| Mattermost compose and thread replies (and share-message → Mattermost) | `src/extensions/mattermost/mattermost-cards.js` | mattermost · team |
| VK Teams compose and thread replies (and share-message → VK Teams) | `src/extensions/vk-teams/vk-teams-cards.js` | vk-teams · team |

Not wired: Telegram (Petya only reads it), build questions to Slack (`src/build-question.cjs`, a fixed template, not a
user draft), Jira comments (task tracker, not a message to people; can be added the same way).

## Tests

`tests/outgoing.cjs` — registration and order, channel filter and readiness, timeouts and failures that never block,
frozen drafts, span placement, `apply`/`applyAll`, and the Slack confirmation («Отправить» sends the exact text,
«Применить правки» re-confirms, a hanging review does not delay the confirmation past its budget).
`tests/tone-check-ui.cjs` — the widget in a real Discord confirmation.
