# A/B tests («A/B-тесты»)

Category: analytics. Directory: `src/extensions/ab-test/`. Local: no account, no network.

Answers «is the test significant, how big is the effect, can the numbers be trusted, how long to wait» as one
card. Every number on it is computed by code (`stats.cjs`, `analyze.cjs`); nothing is estimated by the model.

## Input

- Numbers in the request: «A: 1000 игроков 120 конверсий, B: 980 и 141», «контроль — 120 из 1000, тест — 141 из
  980», «A 1000/120, B 980/141», «A: 5000 / 4,1%», means «A: среднее 5.2, sd 3.1, n 500; …», assignment counts
  only «A 50000, B 49000» (SRM check). Thousands with spaces («12 000») are read.
- A pasted table (tab, `;`, `,` or Markdown `|`) with a variant column and users + conversions, or mean + sd, or one
  row per user with a value column.
- An attached CSV/TSV/TXT (moved from the composer into the chat when used). Per-user 0/1 values are conversions;
  other per-user values are means.
- Free-form text the parser cannot read goes to the local model with a fixed JSON schema (temperature 0); every
  number it returns must literally occur in the text, otherwise the result is refused and the user is asked for
  numbers. Without a model the user is asked directly.
- Extras read from the request: planned split («сплит 90/10»), daily traffic («в день 800 игроков»), days running,
  MDE («MDE 5%»), α, and peeking words («каждый день смотрю», «можно останавливать?»).

## Statistics

- Conversions: two-proportion z-test (pooled SE), Wilson score intervals per variant, the difference CI (unpooled
  Wald) and the relative lift CI (delta method on log of the ratio).
- Means from summaries or per-user values: Welch's t-test (t-distribution via the regularized incomplete beta).
- Heavy tails (per-user values with |skew| > 2 or more than half zeros, e.g. revenue): percentile bootstrap of the
  difference and of the lift, 2000 resamples, fixed seed 42 (mulberry32), bootstrap p-value.
- More than two variants: each against the first (control), Holm–Bonferroni adjusted p-values.
- SRM: chi-square goodness of fit of the group sizes against the planned split (equal unless given); flagged at
  p < 0.001.
- Power: sample size per group for the MDE (default +10% relative, Fleiss formula without continuity correction,
  α=0.05, power 80%), the MDE detectable at the current size, days to wait at the daily traffic.

Verdict: «SRM — проверьте разбиение» (SRM first: nothing else can be trusted), «рано» (fewer than 100 players or
10 conversions in a group, or not significant and the test is under-powered for the MDE), «B лучше / хуже (p=…,
+x% [ci])» (Holm-adjusted p < α; with the bootstrap, the interval must exclude zero), «разницы не видно» (not
significant with enough players for the MDE). Significance before the planned sample gets a peeking warning.

## Card

The verdict line; variants as rows with the rate, its 95% interval and a dot + range bar on a common axis; the lift
of each variant over the control with its interval around zero, p-value and the test used; the SRM line (observed
vs planned split); the power line with a progress bar to the planned sample and days to wait; warnings. The SRM-only
card shows each group's share against the plan marker; the plan card («сколько нужно игроков») shows the sample per
group and bars for neighbouring effects. Actions: «Сколько ещё ждать?» (asks the chat; the app asks for daily
traffic through the shared question panel when unknown, then computes the days), «Скопировать отчёт» (plain-text
report computed by the app).

## Phrases

Triggers (when added): «значим ли тест», «посчитай A/B», «сколько нужно игроков для теста» (asks for the current
conversion if missing), «есть ли SRM», «сколько ещё ждать A/B-тест», numbers by group with test words.
Not triggered: «тест упал», «упали тесты в CI» (CI), «напиши тесты» (coder), «проверь тест на регулярку»
(regex-cron), «запусти тесты», «значимые задачи спринта», «что такое A/B-тест».

Cross-integration with «Метрики игры» (pulling D1 retention per test group) is not implemented: AppMetrica has no
test-group dimension without a custom profile attribute.

## Tests

- `node tests/ab-test.cjs` — distributions against SciPy 1.18 values (Φ, Φ⁻¹, t, χ²), the Wilson interval on
  Newcombe's 81/263 example, Welch on the Wikipedia «Welch's t-test» sample (t=2.4554, df=24.99, p=0.0214), the
  Fleiss sample size 10%→12% = 3841, Holm, SRM (scipy.stats.chisquare), seeded bootstrap reproducibility; parsing,
  verdicts, clarifications (traffic, baseline) with invalid answers, CSV attachment, the model-number guard,
  routing near-misses and the offer.
- `tests/ab-test-ui.cjs` (Electron) — four cards (early, three variants with Holm, SRM-only, plan), safe variant
  names, copy and «Сколько ещё ждать?», and a chat request end to end; screenshots `petya-ab-test*.png`.

## Verified

Fully local; verified with the tests above. No live service involved.
