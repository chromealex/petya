# Subscriptions («Подписки и продления»)

Category: personal. `src/extensions/subscriptions/`, setting `extension_subscriptions`, settings card (`settings.js`),
`connects: Почта`. Built on mail records (`docs/foundations/mail-records.md`); no model in the app itself.

## What it does
- «За что я плачу каждый месяц?», «мои подписки» — services from subscription mail and from receipts of one merchant
  repeated at a regular interval (one-off orders are left out): amount, period (from the mail, or «по истории
  платежей»), the next charge (stated in the mail, or the last charge plus the period), a sparkline of up to 12 past
  charges, and the monthly total per currency (no conversion) with the yearly figure. Services without a charge for
  1.6 periods are folded under «Похоже, отменены».
- «Что продлится на этой неделе?» — charges and expiries within 7 days (highlighted in the card).
- «Сколько уходит на сервисы?» — the monthly total.
- «Когда истекает домен?» — renewals of domains, certificates and licenses by expiry, with the time left.
- «Обнови подписки из почты» / «Обновить из почты» — reads new mail now; otherwise mail is re-read when the last
  reading is older than 6 hours (a failure answers from stored records and says so).
- Row actions: «Напомнить перед списанием» — sends «Напомни 8 декабря в 10:00: 9 декабря спишется Netflix — 799 ₽» to the
  chat, where «Напоминания» handles it (shown only when that app is added; there is no reminder kind in app-links, the
  reminders app is driven by its own chat phrases); «Открыть письмо» — the message in the chat browser; «Не подписка» —
  hides the merchant in this app (`subscriptionsHidden`) with «Отменить».
- Hovering an amount or a date shows the line of the mail it was read from.

## Setup and privacy
Mail must be connected («Подключения → Почта»; otherwise the answer is a question saying so). Reading is off until the
user turns it on in the settings card (what is read and kept, how far back, the model fallback, «Прочитать почту
сейчас», delete all records with a red trash button) or answers the consent question in the chat («Включить и
прочитать почту / Не сейчас»). A running reading is in the notification center (`mail-records-scan`) and restored after
a reload.

## Phrases and near-misses
Own: «за что я плачу каждый месяц», «что продлится на этой неделе», «сколько уходит на сервисы», «какие у меня
подписки», «когда истекает домен». Not this app: «подпишись на канал релизов», «подпиши договор», «отпишись от
рассылки», «продли спринт / фокус», «сколько стоит Unity Pro», «сколько у меня подписчиков», «забронируй переговорку»,
«на что ушёл день» (Учёт времени).

## Verified
Stubs only: `node tests/subscriptions.cjs` (the real mail records foundation over fixture mail in a fake account:
routing, no mail, consent, services and inferred periods, lapsed, renewals, totals, week/total/renewals answers,
reminder text, hide, incremental refresh, failures, offers). UI: `tests/subscriptions-ui.cjs` (screenshot
`petya-subscriptions.png`). Live checks left: real Gmail/Outlook mail of popular services, Gmail web links opening the
right message, the reminder request with «Напоминания» merged.
