# Exact negative values and independent recipient permission

Continue from v12's repaired adapter to address the remaining customer-permission failure and approved exact negative value collapsing to null bounds. The frozen run has 410 presentations: all 117 prior acquisition and last-check cases twice, sixteen additional copies of each current correction, 64 numerical rehearsal cases, 32 prior permission variants and 24 new paired variants twice. New numeric variants contrast exact, upper-only, lower-only and unapproved values at the same negative number. Permission variants separate recipient permission from private-field visibility under identical final questions.

`protocol.json` freezes one epoch, learning rate 0.000005, seed 42 and thirteen adapted blocks before inference. The unchanged v7 trainer and v8 evaluator are reused. `prepare.py` runs with the training environment's ARM Python 3.12; the system's Python 3.8 release candidate reported an encoding parse error on a valid UTF-8 long line. No generated data or training run was accepted from that failed invocation.

The acquisition set includes all 77 retained v12 targets and all 40 previous fresh checks, now explicitly familiar. All 117 must remain correct after ordinary reload. The 48 newly reserved cases contain twenty drafts (eight exact-label/color states, eight permission/visibility states across both orders, two notification-privacy states, scope exclusion and repeated correction), twenty numeric cases (sixteen paired negative-value states and four interval inclusivity states) and eight general checks. Fresh prompt signatures are disjoint from historical fixtures and training. Expected answers and literal metadata do not enter model requests.

Manual non-blind draft review accepts semantic paraphrases and grammatical awkwardness, but requires all agreed decisions, fields, recipients, exclusions, exact quoted labels and only genuinely unresolved questions. Independent literal checks preserve case, ё and leading zeros. Compare individual cases, not just totals: a higher aggregate score must not hide newly broken answers. Any acquisition-only repair must be frozen before candidate fresh answers are generated or examined.

Live prompts, dialogue roles, sampling, repeat guard, application model selection and MCP remain unchanged. These are research fixtures and experimental weights, not an application capability or automatic petya-v1 release. Small related synthetic checks do not establish broad reliability.

## Balanced same-value repair before fresh inference

The initial adapter exactly passes 116/117 familiar cases. Both requested fixes pass, but `v13-upper-0` now turns the approved upper-only bound -93 into exact -93. This is a real retention regression. The initial recipe gives additional weight to the exact-value correction without equal additional weight to its same-number controls; this is a plausible source of interference, not a proven causal attribution.

Before any candidate fresh inference, a 229-step repair at 0.000005 is frozen in `repair-protocol.json`: all 117 retention cases once, twelve additional copies of each of the four -93 states (exact, upper-only, lower-only, unapproved), and all 64 prior numerical variants once. The initial artifact and raw failure are preserved. The fresh set, rubric and gate remain unchanged.

## Final result

The initial 410 updates completed in 479.7 seconds; the balanced 229-update repair took 225.6 seconds. Both trained 6,094,848 adapter parameters with approximately 16.9 GB peak allocation. Finite losses, tensor checks and data/parent/weight hashes passed. Both artifacts remain preserved; the selected artifact is `repaired-adapter`.

After ordinary reload, all 117 familiar targets exactly match: all 77 earlier retention cases and all 40 previous v12 checks. This includes both requested fixes and the upper-only -93 case that regressed in the initial run. Selection was committed before generating candidate fresh answers. These are trained retention targets, not unseen evidence.

| Model | Complete new drafts | Numeric bounds | General checks | Exact label coverage | Rename/color | Recipient/field |
| --- | --- | --- | --- | --- | --- | --- |
| Base | 11/20 | 14/20 | 8/8 | 8/8 | 5/8 | 5/8 |
| Immediate v12 parent | 18/20 | 15/20 | 8/8 | 8/8 | 8/8 | 6/8 |
| Historical v8 | 10/20 | 14/20 | 5/8 | 8/8 | 5/8 | 2/8 |
| Repaired v13 | 19/20 | 20/20 | 7/8 | 8/8 | 8/8 | 7/8 |

The candidate passes 46/48 complete fresh cases, versus 41/48 for its parent. All four new exact negative values, including decimals, now pass; so do their upper-only, lower-only and unapproved controls and all four interval combinations. All names and rename/color decisions remain correct. The remaining draft failure is `report-0-10`: supplier delivery remains prohibited despite permission when the address remains hidden. The corresponding visible-address case improves.

A new regression appears in `g1`: descending order is requested, but the model returns ascending order. Automatic paired comparison records six gains and one regression. `diagnostic.jsonl` reruns descending sort first and the remaining permission failure second after a separate model reload; both raw answers reproduce exactly. Thus neither failure depends on the preceding full evaluation sequence. The diagnostic is explicitly post-evaluation and does not count as new independent test data.

The per-case no-regression and reliable prohibition-handling gates fail. **petya-v1 is not released or deployed**; live application model selection remains unchanged. `remaining-corrections.jsonl` retains the two failures, corrected references and observed answers. Neither trained this candidate. Next work should balance ascending/descending controls on identical arrays while preserving the now-correct numerical states, and broaden recipient permission examples beyond these related report templates.

`results/paired-comparison.json` is produced automatically by `summarize.py`, so aggregate gains cannot hide broken parent successes. `results/summary.json` separately records familiar retention, fresh results, diagnostic reproduction and release status. All 48 outputs pass schema checks, which alone does not establish correctness. Validation includes six literal-label tests, five strict-scoring tests, script parsing, frozen hashes, disjoint fresh prompts, conflict-free targets, complete case coverage and inference provenance. Review is manual and non-blind on a small related synthetic sample; general live-dialogue reliability remains unproven.
