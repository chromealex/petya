# Balance simulation («Симуляция баланса»)

Category: gamedev. Directory: `src/extensions/balance-sim/`. No settings card (`settings: false`). Uses
`spreadsheet-export`; reads configs through «Конфиги и баланс»' readers and, optionally, player journeys of a
connected metrics source («Метрики игры» → AppMetrica).

## What it does

«сколько дней до 10 уровня у игрока без доната», «что будет с экономикой, если поднять награду за победу на 20%»,
«симулируй прогрессию по текущим конфигам», «за сколько дней игрок накопит 5000 золота», «смоделируй экономику на 60
дней для 2000 игроков».

1. **Economy from configs** (`economy.cjs`). The project's configs are scanned with
   `src/extensions/config-balance/files.cjs` (Unity ScriptableObject `.asset`, JSON, CSV; every value keeps its file
   and line). By field names only (camelCase / snake_case / nested paths split into words):
   - sources: a trigger (`win`/`victory`, `loss`/`defeat`, `daily`/`login`, `battle`/`match`/… = any action) with a
     resource (`xp`/`exp`, `gold`, `coins`, `gems`, `crystals`, `soft`, `hard`, …) and/or a reward word
     (`winGold`, `rewards.victory.coins`, `dailyLoginGold`);
   - sinks: `price`/`cost` fields of objects in a list (items, upgrades, units) with the currency from the field name
     (`costCoins`) or a `currency` field; a cost of the action itself (`battleEnergyCost`) is noted, not a sink;
   - the XP curve: objects with a level and an XP field (`levels.json`), or a numeric array named like
     `xpPerLevel`; read as «total XP to reach the level» or «XP to the next level» (from the name or the shape; the
     user can switch it on the card);
   - loop hints: `battlesPerDay`, `winRate`.
   Chances, multipliers, limits and ids are never rewards. The main currency is the one most sources pay.
2. **The confirm card.** Rewards with `file:line`, a price ladder per currency (a currency nothing pays for is marked
   «бесплатно не заработать» and left out of «all purchases»), the curve and its reading, and the loop: battles per
   day, win rate («из конфига» / «предположение» / «из метрик»), players (10–5000), days (1–365), seed, «spends on
   purchases as soon as it can». The horizon is long enough for the asked milestone at the expected pace × 3 (14–365
   days), 30 days otherwise. Nothing runs before «Запустить симуляцию».
3. **The simulation** (`sim.cjs` in a worker thread, `sim-worker.cjs`; ipc `run(cardId, loop)`, one run per card at
   a time; the economy is taken from the stored card, the loop from
   the page is checked and clamped). A seeded PRNG (mulberry32): each player gets an activity multiplier
   (log-normal, σ 0.4, mean 1); battles per day ~ Poisson(battles × multiplier); a day with a battle pays the daily
   rewards; each battle is a win with the win rate; at the end of a day the player buys the cheapest affordable
   sinks in price order, once each; XP gives the level through the curve. Output: p10/p25/p50/p75/p90 per day for the
   level and each currency, milestones (level N, earning N, all purchases) as percentiles of the day reached and the
   share that reached them, the realised pace (a check that it matches the inputs) and spending per player.
4. **What if.** «поднять/снизить/удвоить … на N% / в N раз / до N» is parsed by code; the words name sources by
   trigger and resource («награда за победу» → `winGold`; XP only when named) or sinks («цены улучшений», «цену Меч 3»).
   An unknown target or a missing amount is a clarification (shared question panel) before anything runs. Base and
   variant run on the same seed and draws; the card overlays the variant bands on the base median (dashed) and shows
   before → after in the milestones; the answer names what moved and what did not.
5. **The answer** is written by code from the result («до 10 уровня: медиана 8 дней (10% игроков — за 5 и быстрее,
   10% — за 13 и дольше)…»). No model is involved anywhere.

«Взять из метрик» (only when a metrics source with `events` and `journeys` is connected): the last 7 days of
`battle_end`-like events, or `…win`/`…lose` events, → battles per player-day (mean) and wins / (wins + losses) (at
least 20 battles). The values fill the form; the user still presses «Запустить симуляцию».

«Выгрузить в Google Таблицы» (`spreadsheet-export`): one row per day with p10/p50/p90 of the level and the main
currency (and the variant's).

Near-misses (null / no offer): reconciling or validating configs and their history («сверь баланс с конфигами»,
«проверь конфиги юнитов», «что поменялось в балансе») stay with «Конфиги и баланс»; DAU/retention with «Метрики
игры»; «баланс на карте», «баланс работы и жизни», «сколько дней до отпуска», «уровень английского», «что такое
симуляция Монте-Карло». Paying players are not modelled (said in the answer).

## Limits

Purchases for real money, energy limits, matchmaking that changes the win rate with level, events and offers are
not modelled. Rewards that depend on the level (tables of rewards per level) are read as separate fields only when
their names say the trigger and the resource. One XP curve (the longest) is used.

## Verified

Unit `node tests/balance-sim.cjs` on `tests/fixtures/balance-sim/project` (a ScriptableObject with battle rewards and
an energy cost, `economy.json` with the daily bonus and `battlesPerDay`, `levels.json` with `xpToNext`,
`upgrades.json` with gold and gem prices): routing and near-misses, the what-if parser, economy detection with
`file:line` (also nested JSON, upgrade lists, XP arrays), both curve readings, determinism, realised pace, monotone
percentiles, edge cases, the confirm card then the run by id, the answer texts, the clarifications and their
resumption, calibration from journeys. UI `tests/balance-sim-ui.cjs` (screenshots `petya-balance-sim-confirm.png`,
`petya-balance-sim.png`, `petya-balance-sim-whatif.png`).

Needs live checking: real projects' field naming (rewards hidden in tables per level or per mode), the speed of
5000 players × 365 days at 20 battles a day on a slow machine (≈ 3 s here, in a worker thread), the AppMetrica Logs API export for a week of battle events.
