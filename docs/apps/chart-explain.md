# Explain the chart («Объясни график»)

Category: analytics. Directory: `src/extensions/chart-explain/`. Settings: none.

Why a chart dropped or rose. The answer names the day it moved and the candidate causes, **each with its evidence
and date**; when nothing fits, «Нет явной причины» is the answer, with what was checked and what is not connected.
No model writes the explanation.

## Where the series comes from

- **A card Petya drew in this chat** (`series.cjs`, the newest of the last 16 messages): «Метрики игры» (DAU, new
  players, revenue of the first source), «Реклама и монетизация» (revenue per day, total and per network),
  «Покупки в игре» (paid per day, per currency), «SQL по словам» (a result drawn as lines over dates). The card's
  own data is used, never a picture of it. A metric named in the question picks the series («почему просела
  выручка» → revenue). Grafana panels and other cards are not adapted yet.
- **A screenshot** attached in the composer (messages with attachments go through `desktop-reply.cjs`, the chat
  extension flow; the provider answers only while the app is added). The user's local vision model reads the points
  of the main line with their axis labels (`vision.cjs`, the same model choice as «Скриншот → задача»: `gemma3:4b`
  or another installed vision model, through the local Ollama endpoint only). Without such a model nothing is read:
  the card offers «Скачать модель» (the optional-models download with its own progress in notifications) and
  «Прочитать график» afterwards (the screenshot stays in that chat). Code turns the labels into dates («4 нояб.»,
  «04.11», «Nov 4», «2026-11-04»; the latest year not in the future) and refuses a chart whose dates it cannot read.
  The answer says the values are approximate.

## Where it moved (`detect.cjs`)

For each day with at least three earlier days: the deviation from the median of up to 7 earlier days. The largest
one in the asked direction («упал» — down, «вырос» — up, otherwise either) is the event; under 8% is «no notable
change». The onset is the first day of the run that stayed at least 40% as far off; «step» when the days after stay
off, «spike» when they come back.

## Evidence (`evidence.cjs`, all read-only, from apps the user connected)

| Kind | Read from | Counts when |
|---|---|---|
| release | «Сборки»: GitHub Actions runs (`GET /repos/{repo}/actions/runs`, successful, event `release` or a release/deploy/publish workflow), Unity Build Automation successful builds; «Патчноуты»: released Jira versions with `releaseDate` | 0–3 days before the onset (same day included) |
| incident | `monitor-source` history (Prometheus/Alertmanager, Grafana alerting, uptime checks) | overlaps the onset…event days, or starts within a day of the onset |
| crash | crash sources through the «Аномалии» feed: a day with ≥ 20 events and ≥ 2× the median of the 7 days before | from a day before to two days after the onset |
| campaign | `ua-source` rows: from some day every day (up to 3) is ≤ ½ of the 3-day mean before (stopped/cut) or ≥ 2× (started/grew) | 0–3 days before the onset; a grown campaign does not explain a drop and vice versa |
| holiday | `holidays.cjs`: fixed dates, Western and Orthodox Easter, Thanksgiving / Black Friday / Cyber Monday, Lunar New Year and Eids (2024–2030) for RU, US and the card's countries | within a day of the onset or the event |

Ranked by kind (incident, crash, release, campaign, holiday) and distance; at most four causes. A reader that fails
is shown as such («Проверено: … инциденты» in red) and never fails the answer; a kind that is not connected is
listed as «Не подключено».

## Card

The series as a line with the usual level (dashed), the onset…event window and the event dot; one pill per day on
the date axis with the numbers of its causes; the causes list (date, kind, «за день до спада», title, source, link);
«Нет явной причины» box; «Проверено» chips. Screenshot cards: the model offer, then the same card.

## Phrases

Own: «почему упал график», «объясни этот график», «что за провал на графике выручки», «почему просел DAU» (only when
a chart card is in the chat — otherwise the chat model answers), the «Почему упало?» button of «Метрики игры», and a
screenshot with «почему упал», «объясни график», «что на графике». Without a card or a screenshot, a chart word asks
for one.

Near-misses: «почему упала сборка», «почему падает игра/приложение», «почему упал сервер», «почему падает
контейнер», «почему упали тесты», «график отпусков/дежурств/работы/встреч», «нарисуй график», definitions.
«Метрики игры» now refuses «что за провал/пик на графике».

## Tests

- `tests/chart-explain.cjs` — routing and offer, holidays, detection (spike, step, flat, short), series from a real
  metrics card and an ad card, readers against fakes (GitHub Actions on a fake HTTP server, monitoring history, UA
  campaigns), the ranked dated causes, «Нет явной причины», a failing reader, the screenshot path (no model → the
  offer and no model call; the user's model → points from the stubbed local endpoint, label dates), the
  desktop-reply provider only while added.
- `tests/chart-explain-ui.cjs` (Electron) — three cards (causes, no clear cause, model offer), markers per day,
  dates, link, hostile evidence text; screenshot `petya-chart-explain.png`.

## Verified

Stubs only. To check live: how well a local vision model reads real dashboards (dense axes, two lines, dark
themes), GitHub workflow naming in real repositories (what counts as a release run), monitor history from real
Prometheus/Alertmanager, and the holiday list for the game's markets.

Docs: [GitHub REST: list workflow runs for a repository](https://docs.github.com/en/rest/actions/workflow-runs#list-workflow-runs-for-a-repository),
[Ollama chat API with images](https://github.com/ollama/ollama/blob/main/docs/api.md#chat-request-with-images),
[Jira Cloud: get project versions](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-project-versions/#api-rest-api-3-project-projectidorkey-versions-get).
