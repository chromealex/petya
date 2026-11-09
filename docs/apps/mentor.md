# Mentor («Петя-наставник»)

Category: personal. Directory: `src/extensions/mentor/`. Settings: the weekly review (`mentorWeekly`, default off;
`mentorDay` 0–6, default 5 = Friday; `mentorTime`, default 17:00). No service, no model, no network: the analysis is
code over Petya's own chats on this computer, and nothing is created until «Создать».

## Phrases

On request: «что мне автоматизировать?», «что я делаю руками», «что можно автоматизировать», «что я постоянно
прошу», «где я теряю время», «какие запросы повторяются», «Петя-наставник, что нового?», «наставник, разбор недели».
Weekly: «включи наставника по пятницам в 17:00», «включи еженедельный разбор наставника по средам в 9», «выключи
наставника» (or the settings card / the card's «Присылать по пятницам в 17:00»).

Not triggered (tested): «наставник по Unity», «найди наставника» (a mentor for a subject), «ментор для джуна», «нужен
ментор для джуна» (hiring / people), «что мне делать сегодня», «что у меня сегодня» (journal / calendar), «какие у
меня повторы» (the recurring commands list), «что можно автоматизировать в сборке Unity», «что мне автоматизировать в
CI», «автоматизируй сборку» (that system, not the user's habits).

## What is analysed (`history.cjs`)

The user's messages of the last 8 weeks in all chats, with the app that answered each one (`message.by` of the next
assistant message). Left out: chats «По расписанию · …» (recurring runs), the mentor's own chat and commands, the
recurring-command and skill-making commands, one-word replies.

- **Repeated requests**: words lower-cased, «ё» → «е», URLs, issue keys and numbers normalized, stop words removed,
  Cyrillic words cut to five letters; requests cluster greedily when they share ≥ 2 stems and Jaccard ≥ 0.6. A
  pattern needs 3+ requests on 2+ days.
- **Chains of app actions**: in one sitting (gaps under 30 minutes, same day) the sequence of answering apps; chains of
  2–4 different apps seen on 3+ days. Chains that share two steps in a row are one habit (the larger steps × days
  stays). A request that is only a step of a found chain is shown as the chain.
- **Pasted texts**: messages of 200+ characters that share half their 6-word shingles, 3+ times; lines present in ⅔ of
  the copies form the template, other lines become `{…}`.
- **Repeated web searches**: requests answered by «поиск в интернете» (or «найди в интернете …»), clustered the same way.

Already automated is left out: requests similar to a recurring command (`s.recurring.list()`), phrases a learned
skill answers (`s.learning.preview`), chains with such a step, hidden and created patterns (per company,
`<company data>/extensions/mentor/cache.json`).

## Time method (shown in the card under «Как считал»)

Typing 200 characters a minute; 15 s to switch to Petya and send; 20 s to read an answer; 40 s to look through search
results; 30 s to find and paste a template. Per week = one time × occurrences per week (count ÷ weeks since the first
occurrence, at least one). Saved: a schedule or an app removes typing and switching; a skill removes typing except a
short ~40-character request; a template skill removes finding and pasting. Patterns are ranked by minutes saved per
week (top 8).

## Proposals (`proposals.cjs`) and «Создать»

1. **App from the catalog** — the extensions' own offers (`extension-offers.cjs` `candidates`/`decide`, direct
   requests only) name an app that is not added yet. «Создать» shows the regular offer card for it
   (`s.extensionOffers.prerequisite`), which adds it and resumes the request.
2. **Schedule** — a request, search or chain on 3+ days at a regular time (IQR of the time of day ≤ 2 h) and a daily
   (median gap ≤ 2 days) or weekly (5–9 days) rhythm: «<request> каждый день в HH:MM» / «… каждую неделю» (a chain
   joins its steps with «, затем »). «Создать» sends «Создай повтор: …» to the chat; the mentor hands the phrase to the
   existing recurring commands (`src/features/recurring.cjs`), which create it and answer.
3. **Skill** — pasted templates, chains at irregular times, long requests (60+ characters) or requests answered by the
   model: a SKILL.md draft (name from the words, a description saying when to use it, examples with dates, the
   template). «Создать» installs it with the skill tools (`src/skill-library/installed.cjs` into
   `<userData>/skill-packages`, a unique name); it appears on «Скиллы».
4. **Extension idea** — short requests answered by an app the catalog has no direct offer for: a draft
   `extension.json` (id `my-…`, name, description, guessed category, examples from the requests, `setting`,
   `feature`). «Создать» saves it to `<company data>/extensions/mentor/drafts/<id>/extension.json` with «Показать в
   папке». The base has no external-extensions (dev folder) feature, so the draft is only a starting point; it is not
   installed.

«Скрыть» stops proposing a pattern. The main process acts only on patterns of a card it made in this company.

## Weekly review

A timer (every minute, not in smoke tests) runs on the chosen weekday within 6 hours after the time, once a day: the
analysis goes into the chat «Петя-наставник» (a message with the card), a notification-center item `mentor:weekly`
and a system notification. Nothing found → no message.

## Card

`mentorCard` → `renderMentorCard` (`mentor-cards.js`): minutes per week that can be saved, ranked rows (number, the
request in quotes or the chain, kind, «раз: N, дней: M», «обычно около HH:MM», a bar of minutes saved per week, the
proposal chip, time spent now), «Примеры (N)» — the user's own requests with relative dates — and the draft (phrase,
SKILL.md, extension.json or the app's pitch), «Создать» / «Скрыть», «Как считал», and the weekly state.

## Verified

Stubs only: `node tests/mentor.cjs` (synthetic history in `tests/fixtures/mentor-history.cjs`; real recurring
commands and skill installation into temp folders; offers stub) and the Electron card test `tests/mentor-ui.cjs`
(screenshot `petya-mentor.png` / `-bottom.png` in the temp folder). Needs live checking: patterns and estimates on a
real, long chat history (thresholds may need tuning); the chain proposal as one recurring command (the pipeline may
offer to split it between agents).
