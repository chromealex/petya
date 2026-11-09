# Notification policy

One place decides, for every system notification Petya shows, whether it is **delivered** now, **held** (kept by
the policy that held it and released when its condition ends) or **summarized** (no system popup; collected into
one quiet «Тихие уведомления» item in the notification center). Petya itself knows no condition: policies come
from extensions — focus sessions, quiet hours, meetings in progress, per-source mute rules.

Module: `src/features/notification-policy.cjs` (feature `notificationPolicy`, service `s.notificationPolicy`,
IPC `status`, `clear`).

## How notifications reach it

Every system notification Petya shows is an Electron `Notification`, so one wrapper around
`Notification.prototype.show` (installed once by the feature) routes each one through `route()`. Nothing in the
application shell changes. The «smart notifications» switch (`smartNotifications`) and each app's own switches keep
deciding *whether* something is sent at all; the policy decides only *when*.

### Who is sending (source)

A sender wraps its notify call so the notification carries a source:

```js
require('./features/notification-policy.cjs').tag({source:'assignments'},()=>ctx.notify(text));
```

or sets `notification.petyaSource` itself. Without a tag the source is `'petya'`.

An app's background notice uses the helper, which tags it, marks it urgent when asked and shows it (nothing in smoke
tests); the app's own notification-center item stays separate and is always published:

```js
require('../../features/notification-policy.cjs').notify(s, {source:'monitoring', title, body, urgent:true}, {electron});
```

Known sources:

| source | sender |
| --- | --- |
| `assignments` | smart notifications about assignments (`src/agents-setup.cjs` → `TaskMonitor`): done, failed, interrupted, decision needed |
| `monitoring` | «Мониторинг» state changes (`notice` in `src/extensions/monitoring/feature.cjs`): a service down (urgent), back up, flapping; the center card `monitoring:<service>` stays |
| `vk-teams` | «VK Teams» background sync failures (`background` in `src/extensions/vk-teams/feature.cjs`), once per new error; the recovery is in the center item `vk-teams-sync` only |
| `petya` | everything else (chat answers, created tasks, reminders, …) |

### Urgent

Computed once for every policy (`urgent(n)`): marked by the sender (`petyaUrgent`, or `petyaFocus` — the focus app's
own notifications), `urgency: 'critical'`, or urgent by its words (a decision or answer needed, an error or failure,
a meeting about to start, a reminder). Policies should let urgent ones through; the core does not force it, so a
policy may still decide otherwise deliberately.

## Registering a policy

```json
"provides": {"notification-policy": "policy.cjs"}
```

```js
module.exports={
  id: 'focus',                 // default: the extension id
  label: 'Фокус-сессия',
  order: 10,                   // lower wins a tie (default 1000)
  ready: settings => bool,     // optional, default yes: whether it applies now (usually its app's switch).
                               // Unlike other registries the app need not be added: a condition may outlive the switch.
  // Synchronous (Notification.show is): null for no opinion.
  decide(services, notification) { return {action:'deliver'|'hold'|'summarize', reason:'…'} | null; },
  // Required to hold: keep it and release it yourself when the condition ends.
  accept(services, notification) {}
};
```

`notification` is `{title, body, source, urgency, urgent, at}` — a plain object, never the Electron one.

## Decision

The strongest decision of the ready policies wins: **hold > summarize > deliver**; a tie goes to the lower `order`.
A policy that throws is ignored; a `hold` without `accept` is ignored; an `accept` that throws means the notification
is shown. A notification is never lost: the worst case is that it is shown.

- `decide(n)` → `{action, policy, reason, notification}` (pure).
- `route(n)` → `true` when the system notification is not shown now (the wrapper's gate).
- `summary()`, `clear()` — summarized notifications (last 50); each summarize updates the notification-center item
  `notification-summary` in place.

## Policies today

| Policy | App | Behaviour |
| --- | --- | --- |
| `focus` | «Фокус» (`src/extensions/focus/policy.cjs`) | While a focus session (not a break) runs, non-urgent notifications are held in the session (`focus.json`) and shown as one summary when it ends. |

The focus app's holding moved here without behaviour change: the same urgency rule, the same held list and release;
`tests/notification-policy.cjs` compares the policy with the old gate on the same notifications in every session
state (none, running, paused, resumed, break, after). The focus policy declares no `ready`, so — as before — a session
that is running holds even if the app was switched off meanwhile; it ends and releases as usual.

Quiet hours, meetings in progress and per-source mute rules are policies other apps can add with the contract above;
`tests/notification-policy.cjs` exercises such policies (stubs) against the core.

## Tests

`tests/notification-policy.cjs` — registration and order, strongest decision, broken policies, summaries and the
center item, the source of smart notifications (muting `assignments` summarizes them, a decision needed still
shows), `notify` for monitoring and VK Teams (a mute rule by source summarizes a recovery, a service down and a
failure still show, the center card is always there), the focus parity check. `tests/vk-teams.cjs` checks the sync
alert's system notification (once, source `vk-teams`). `tests/focus.cjs` and `tests/focus-ui.cjs` keep covering the focus app itself.
