# Calendar app (`src/extensions/calendar`)

«Календарь» shows the day's meetings, a week strip, free time, and a common slot for several people, from
Google Calendar (API v3) or Outlook (Microsoft Graph). It reuses the mail accounts Petya already has
(`settings.gmailCredential` / `settings.microsoftCredential`). Calendar access is requested separately through
incremental consent. Dates, free/busy, and slot ranking are computed by code. The local model is not used.

## Phrases

| Request | Card |
|---|---|
| «что у меня сегодня», «встречи на завтра», «что в календаре на пятницу» | day timeline |
| «покажи мои встречи на этой неделе» | week strip |
| «когда я свободен в пятницу», «есть ли у меня окно завтра» | day timeline with free gaps |
| «найди час с Машей и Олегом на этой неделе» | ranked slots with each person's busy lanes |
| «поставь встречу с Машей в четверг в 15:00 «Синк»» | the requested slot (with conflicts) plus nearby alternatives |

These phrases are not handled by the app and return `null`: meeting summaries («сводка встречи», «что решили на встрече»,
which belong to `meetings`), «слушай встречу», Jira due dates («срок задачи»), «календарь отпусков»,
birthdays, cron, «что у меня сегодня по задачам», and «найди время в логах». The same list is in `AVOID`
and `offer.cjs`.

People are taken from «Команда» (`teamMembers`): name, aliases, Jira name, and email local part, with Russian case
endings folded («Машей» → «Маша»). Explicit emails are taken as-is. When a name matches several members, Petya asks
a strict-choice clarification. When a name is unknown or the member has no email, Petya asks for an email (inline),
offers «Без …», or accepts another name. Both clarifications go through the shared question panel
(`input-required.cjs`), and the answer resumes the same step. When two calendars have access and none is chosen,
Petya asks which one to use and remembers the answer (`calendarAccount`).

The default working hours are 10:00–19:00 local time. Slots are searched on weekdays only, unless a single day
was named. Today's search starts at the next half hour, in 30-minute steps. Slots are ranked in this order:
everyone free, then 15 minutes of margin around the slot, then core hours (11–17), then earlier days. At most
two slots are shown per day. A person whose calendar cannot be read is shown as unknown and is never counted
as free. The settings let you change the working hours, the default length, and the account.

## Writes

The chat turn never creates an event. «Поставить встречу» on the card opens a confirm step with an editable
title, the time, the attendees, and a Meet/Teams checkbox. Only «Создать в календаре» calls the
`calendarApp.create` IPC. The event is built from the card data stored in the chat message, not from data the
page sends. Only the slot index and the title come from the page.

A duplicate click is refused, and an event that was already created is returned, not created again. If the
service gives no answer, the card is marked `unknown`, and Petya refuses to repeat the write until the user
checks the calendar.

The Google insert uses `sendUpdates=all` and `conferenceDataVersion=1` with `hangoutsMeet`. The Graph
`POST /me/events` uses `isOnlineMeeting` with `teamsForBusiness`. While the browser consent is open, it is shown
in the notification center (`calendar-connect`), and the state is restored through `status`.

## Endpoints

- Google:
  - `GET /calendar/v3/calendars/primary/events` (`singleEvents`, `orderBy=startTime`)
  - `POST /calendar/v3/freeBusy` (the user is `primary`)
  - `POST /calendar/v3/calendars/primary/events`
- Microsoft Graph v1.0:
  - `GET /me/calendarView` (`Prefer: outlook.timezone="UTC"`)
  - `POST /me/calendar/getSchedule` (busy, tentative, and oof count as busy)
  - `POST /me/events`

## Setup

### Incremental consent

`src/gmail.cjs` and `src/outlook.cjs` now accept `start({scopes, email})` (the shared change, which is backwards
compatible). Mail scopes are kept and extra scopes are added. Google uses `include_granted_scopes=true` and
`login_hint`.

The granted scope string is stored in the account's tokens (`tokens.scope`). Outlook also stores the requested
`tokens.scopes` and refreshes with those scopes. Accounts that only have mail refresh exactly as before.

The OAuth gateway (`oauth/server`) and `service-oauth.cjs` are not involved, because Gmail and Outlook use
local loopback OAuth with PKCE.

The scopes requested are:
- Google: `calendar.events` and `calendar.freebusy`
- Microsoft: `Calendars.ReadWrite`

### Steps

Open «Настройки → Календарь»:
- «Разрешить доступ к календарю» upgrades an existing mail account.
- «Подключить Google/Microsoft с календарём» adds a new account.

Google Cloud Console, in the project of the Desktop OAuth client used for Gmail:
1. Enable **Google Calendar API** (APIs & Services → Library).
2. On the OAuth consent screen (Data access / Scopes), add
   `https://www.googleapis.com/auth/calendar.events` and `https://www.googleapis.com/auth/calendar.freebusy`.
   Both are sensitive scopes, so a published app needs verification. In Testing mode, add the users as
   Test users.

Azure / Entra app registration (the Application ID used for Outlook mail):
1. API permissions → Microsoft Graph → Delegated → add **Calendars.ReadWrite**.
2. Some tenants require admin consent («Grant admin consent»).
3. The redirect stays `http://localhost` (public client, PKCE).

## Limits

- Personal Microsoft accounts have no `getSchedule`. For them, only the user's own busy time is used (taken from
  `calendarView`), and colleagues are marked unknown. Teams links may not be available for personal accounts.
- Only the primary calendar is read. All-day events are shown as chips and do not block slots.
- Time zone: the computer's local zone (an IANA name for Google; UTC on the wire for Graph).

## Verification

Everything was tested with stubs. No real credentials were available.

- `node tests/calendar.cjs` covers:
  - routing and near-misses, the not-added, no-account, and mail-only states
  - Google and Graph requests and parsing, service errors (scope, disabled API), the personal-account fallback
  - clarifications, the confirm-only idempotent creation, and the unknown outcome
  - the consent notification
  - the Gmail/Outlook scope and refresh behaviour, and the offer
- `xvfb-run … electron tests/calendar-ui.cjs` renders all card modes and checks them with screenshots
  (`/tmp/petya-calendar.png`, `/tmp/petya-calendar-slots.png`).

Still to verify live:
- the consent screens with the real Google and Azure clients, and the scope strings the services return
- freeBusy and getSchedule access to colleagues' calendars in a real Workspace / Microsoft 365 tenant
- the Meet and Teams link creation
