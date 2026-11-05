# Exact negative values and independent recipient permission

Continue from v12's repaired adapter to address the remaining customer-permission failure and approved exact negative value collapsing to null bounds. The frozen run has 410 presentations: all 117 prior acquisition and last-check cases twice, sixteen additional copies of each current correction, 64 numerical rehearsal cases, 32 prior permission variants and 24 new paired variants twice. New numeric variants contrast exact, upper-only, lower-only and unapproved values at the same negative number. Permission variants separate recipient permission from private-field visibility under identical final questions.

`protocol.json` freezes one epoch, learning rate 0.000005, seed 42 and thirteen adapted blocks before inference. The unchanged v7 trainer and v8 evaluator are reused. `prepare.py` runs with the training environment's ARM Python 3.12; the system's Python 3.8 release candidate reported an encoding parse error on a valid UTF-8 long line. No generated data or training run was accepted from that failed invocation.

The acquisition set includes all 77 retained v12 targets and all 40 previous fresh checks, now explicitly familiar. All 117 must remain correct after ordinary reload. The 48 newly reserved cases contain twenty drafts (eight exact-label/color states, eight permission/visibility states across both orders, two notification-privacy states, scope exclusion and repeated correction), twenty numeric cases (sixteen paired negative-value states and four interval inclusivity states) and eight general checks. Fresh prompt signatures are disjoint from historical fixtures and training. Expected answers and literal metadata do not enter model requests.

Manual non-blind draft review accepts semantic paraphrases and grammatical awkwardness, but requires all agreed decisions, fields, recipients, exclusions, exact quoted labels and only genuinely unresolved questions. Independent literal checks preserve case, ё and leading zeros. Compare individual cases, not just totals: a higher aggregate score must not hide newly broken answers. Any acquisition-only repair must be frozen before candidate fresh answers are generated or examined.

Live prompts, dialogue roles, sampling, repeat guard, application model selection and MCP remain unchanged. These are research fixtures and experimental weights, not an application capability or automatic petya-v1 release. Small related synthetic checks do not establish broad reliability.

## Balanced same-value repair before fresh inference

The initial adapter exactly passes 116/117 familiar cases. Both requested fixes pass, but `v13-upper-0` now turns the approved upper-only bound -93 into exact -93. This is a real retention regression. The initial recipe gives additional weight to the exact-value correction without equal additional weight to its same-number controls; this is a plausible source of interference, not a proven causal attribution.

Before any candidate fresh inference, a 229-step repair at 0.000005 is frozen in `repair-protocol.json`: all 117 retention cases once, twelve additional copies of each of the four -93 states (exact, upper-only, lower-only, unapproved), and all 64 prior numerical variants once. The initial artifact and raw failure are preserved. The fresh set, rubric and gate remain unchanged.
