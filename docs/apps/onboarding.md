# «Онбординг новичка» (`onboarding`)

A plan for a new colleague's first two weeks, ticked off day by day. Category `team`, code
`src/extensions/onboarding/`.

## What it does

- «подготовь онбординг для Ани, она бэкенд» → a draft card: ten working days from the next working day (the first day
  can be changed on the card), each item with its source:
  - **accesses** (day 1) — the checklist the user keeps in the app's settings (`onboardingAccesses`, one per line;
    «бэкенд: доступ к staging» only for that role);
  - **documents to read** (days 1–4) — «Поиск по всему» (`search()` of `src/extensions/search-all/feature.cjs`: its
    Confluence/Notion, project files, Google Drive and glossary rows; chats, mail, meetings, Jira and messenger hits are
    not documents) plus the semantic index (`files`, `google-drive` collections, only when the user turned them on);
    one document is listed once;
  - **people to meet** (one a day from day 2) — «Кто знает» (`collect()` of `src/extensions/who-knows/feature.cjs` on
    the role's words; members of «Команда» only, with the evidence link) and «Команда» (same role, then others up to
    three) through the people records; a meeting is moved past the colleague's absences (typed ones and the calendar's);
  - **starter tasks** (days 3, 6, 9) — Jira issues with the «good first issue» labels (`onboardingLabels`, default
    `good-first-issue, good_first_issue, goodfirstissue, starter, onboarding`), not done, unassigned, the newcomer's area
    (labels, components, summary) first: `POST /rest/api/3/search/jql` through Petya's Jira connection.
  - What could not be read is a line under «Чего не хватает», never a failure.
- Unchecking an item leaves it out; nothing is stored until «Начать онбординг» (IPC `save`, once per draft).
- «как идёт онбординг Ани?» → the stored plan: the day of the plan, a column per day that fills as items are ticked
  (IPC `check`), «ждут отметки» for past days; «покажи онбординг» lists every plan with its progress.
- The welcome message is a draft by code (first names and the first task key only; names after a colon, never a
  guessed case ending). It passes the outgoing review (`k.outgoingReview`, channel `messenger`/`direct`) and is sent
  only through a `share-message` provider (Slack, Mattermost, VK Teams) whose own flow asks for the chat and confirms.
- Names: a newcomer not in «Команда» named in the genitive («для Ани») is asked — «Аня» / «Ани» or typed; a missing role
  is asked with choices. A colleague is matched only when the first name matches too («Ани Смирновой» is not «Олег
  Смирнов»).

## Privacy

Plans live in `<company data>/onboarding/plans.json` (folder 0700, file 0600), encrypted with Electron `safeStorage`
when available. Opt-in (only «Начать онбординг» writes), deletable per plan (red trash with «Отменить») and all at once
in settings («Удалить все планы онбординга»). Nothing goes to another app's prompt; the local model is not used.
No dashboard widget: the plan is personal data and dashboards repeat requests by themselves and can be shared.

## Phrases and near-misses

Ours: «подготовь онбординг для Ани, она бэкенд», «план онбординга нового сотрудника», «к нам выходит Катя, QA, подготовь
онбординг», «как идёт онбординг Ани», «покажи онбординг». Not ours: «онбординг в игре», «воронка онбординга», «где
отваливаются игроки на онбординге» («Воронки» or nobody), «найди в Notion страницу про онбординг», «что такое онбординг»,
«онбординг пользователей в приложении».

## Tests

`node tests/onboarding-app.cjs` (stubs and a fake clock; `tests/onboarding.cjs` is Petya's own first-run onboarding):
routing and near-misses, the name and role questions, the plan from every source with sources, absences, saving once,
progress by day, list, undo, wipe, encryption at rest, gaps when nothing is connected or Jira fails.
UI: `tests/onboarding-app-ui.cjs` (screenshots `petya-onboarding*.png`). Offers: rows in
`tests/extension-offers-matrix.cjs`.

Needs a live check: «Поиск по всему» relevance for «онбординг <роль>» on real Confluence/Notion spaces; the Jira label
query on a real site (labels are case-sensitive in JQL `IN`); the share-message hand-off reaching a direct chat.
