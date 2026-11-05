# Balanced bounds and permission retention

Continue from the v11 adapter, addressing its five remaining draft failures and two bounds failures. Training includes 596 presentations: all 52 acquisition targets four times, the seven new corrections twelve additional times, 56 independent-decision variants twice, 64 balanced bounds variants twice, sixteen general rehearsal examples twice and 32 prior literal-name examples once. Numerical rehearsal covers all inclusivity combinations, positive/negative/decimal bounds, direct versus revoked-rule histories, one-sided limits, exact values and unapproved proposals. Report variants cross all recipient/visibility states with both orders and identical final questions, avoiding permission-dependent final-question cues.

`protocol.json` freezes hashes and gates before inference. The unchanged v7 trainer runs one epoch at 0.00001 over thirteen adapted blocks, starting with the v11 saved weights. Ordinary reload evaluation uses the unchanged v8 evaluator. Live system prompts, dialogue roles, sampling, repeat guard, model selection and MCP capabilities do not change. This experiment does not create an application feature or automatically release petya-v1.

Acquisition checks all 45 previous targets plus seven current fixes. A separate historical check uses all 32 v11 fresh cases, now explicitly treated as familiar: the seven failures are in training, while the 25 previously successful answers are checked for retention. Candidate selection may use acquisition and historical retention before fresh inference; any repair must be recorded before examining candidate fresh answers.

The new set has 40 cases: sixteen multi-turn drafts, sixteen bounds cases and eight general checks. Drafts include eight exact-name/color combinations, four recipient/field states, two failure-notification privacy states, scope exclusion and repeated correction. Fresh prompt signatures are disjoint from historical fixtures and training. `rubric.json` records expected complete states. References and literal metadata are excluded from model input.

Draft assessment is manual and non-blind. Equivalent wording is accepted, but all agreed final decisions, fields, recipients, explicit exclusions, exact labels and truly open questions must survive. Missing exclusions, contradictions, reopened settled questions and invented requirements fail. `literal_check.py` independently checks case-sensitive labels, leading zeros and ё; Unicode canonical equivalence is accepted. Numeric/general results use the existing strict scorer. Compare base, immediate parent and historical v8 on this same set, not scores on different prompts.

Promotion requires all 52 acquisition targets correct, retention of all prior successful v11 answers, more fresh complete drafts than parent, no numeric/general regression, and 8/8 fresh literal labels. Every targeted decision must pass before claiming reliable cancellation/prohibition handling. Small related synthetic cases and non-blind review cannot establish broad release readiness.

## Historical-retention repair before fresh inference

The initial run acquired all 52 targets exactly. All eight numerical cases in the previous v11 check now pass, fixing both prior boundary errors. However, one formerly successful draft (`name-0-10`) lost an approved rename. The other 15 historical drafts are semantically correct, and all eight general cases pass. Thus initial retention is 24/25 previously successful cases, not a clean improvement.

Before generating or examining any candidate fresh answers, `repair-protocol.json` freezes a 307-step repair at half the learning rate (0.000005). It replays the union of 52 acquisition targets and all 32 historical cases (77 unique prompts) three times, adds twelve repeats of the lost rename and all 64 balanced numerical variants once. Both initial weights and results remain preserved. Selection now requires all 77 acquisition/retention targets semantically correct after reload; the fresh set and rubric are unchanged.

## Final result

The initial 596 updates took 665.6 seconds; the 307-update retention repair took 307.6 seconds. Both adapted 6,094,848 parameters with approximately 16.9 GB peak allocation. Finite training losses, saved tensor checks and parent/data/weight hashes passed. Both artifacts remain committed; the selected artifact is `repaired-adapter`.

After normal reload, the selected adapter exactly reproduces all 77 union targets: all 45 prior acquisition examples, the seven current corrections, and 25 additional previously successful historical cases. This also means all 32 previous v11 check cases now pass, including both numerical failures and the rename that regressed in the initial pass. These cases are now explicitly training/retention examples, not unseen evidence.

| Model | Complete new drafts | Numeric bounds | General checks | Exact label coverage | Rename/color | Recipient/field |
| --- | --- | --- | --- | --- | --- | --- |
| Base | 8/16 | 14/16 | 8/8 | 8/8 | 6/8 | 2/4 |
| Immediate v11 parent | 10/16 | 14/16 | 8/8 | 8/8 | 6/8 | 2/4 |
| Historical v8 | 11/16 | 13/16 | 5/8 | 8/8 | 6/8 | 1/4 |
| Repaired v12 | 15/16 | 15/16 | 8/8 | 8/8 | 8/8 | 3/4 |

All 40 candidate outputs pass schema checks; 38 satisfy complete correctness. All eight independent rename/color combinations pass, with exact literal labels preserved. Both failure-notification privacy states pass, as do scope exclusion and repeated correction. The remaining draft failure is `report-0-10`: customer delivery remains prohibited after permission, while controller email correctly stays hidden.

Both parent numerical failures improve, but `exact-0` regresses: approved exact value -93 produces null bounds. Paired comparison therefore records seven gains and one regression, rather than treating the higher aggregate score as proof of no regression. Aggregate improvement criteria pass, but the stronger per-case no-regression requirement and reliable prohibition handling do not. **petya-v1 is not released or deployed**, and live model selection remains unchanged.

`remaining-corrections.jsonl` preserves the two new failures, corrected references and actual answers; neither was used to train this candidate. `results/summary.json` separates familiar retention, fresh transfer, aggregate improvement, paired regression and release status. The next experiment must preserve the 77 retained cases, repair exact negative values without collapsing one-sided limits, and distinguish recipient permission from field visibility under further new dialogue wording. This small related synthetic evaluation does not establish performance across arbitrary live conversations.

Validation includes six literal-label tests, five strict-scoring tests, script parsing, training/fresh disjointness, absence of conflicting repair targets, complete ID coverage, frozen data hashes, adapter provenance and inference manifests. Manual semantic judgments are non-blind and preserve reasons for every failed or borderline response, including typo tolerance on non-literal recipient roles.
