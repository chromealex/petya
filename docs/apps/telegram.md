# Telegram

The Telegram app (`src/extensions/telegram`, catalog switch `module_telegram`) owns the personal-account source; the
core names none of it and it plugs in through registries (`docs/extensions.md` §9–10).

| What | File | Plugs in through |
|---|---|---|
| Settings card: login by QR or phone, two-step password, chosen chats, background sync | `settings.js` | the app's settings card |
| Settings `telegramCredential` (secret, the session and chosen chats), `telegramAutoSync` | `feature.cjs` | feature `defaults` / `secrets` / `limits` / `flags` / `validate` |
| The source: login, dialogs, sync of the chosen chats into the context memory, media downloads | `source.cjs` | IPC `telegram*`, `serviceJobs` (`telegram`) |
| «Обнови / прочитай телеграм» | `route-sync.cjs` | chat route `sync`, capability `telegram-sync` |
| «Что писали в Telegram?» answered by the local model from the saved chats | `answer-context.cjs` | `answer-context` (`telegramContext`) |
| Pictures and videos of the chosen chats | `media-source.cjs`, `route-media.cjs` | `media-source`, chat route `media` |
| The Telegram row of «В сервисах» on «Команда» | `settings.js` | `window.petyaTeamIdentities` |
| Messenger source, contact search cards | `messenger-source.cjs`, `contact-*` | their kinds |

Without the app added, Telegram requests get the app offer. The vendored client stays in `src/vendor/telegram`.
Computer control's contact search in the Telegram window (`src/computer-intent.cjs`) still uses the app's
`contact-result.cjs` from the core (computer-control lane).

Verified with stubs (unit tests); the MTProto calls are the same as before the move.
