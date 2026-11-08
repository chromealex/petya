# Petya Andromeda D3: D2 data with a doubled rehearsal

D2 learned the new corrections (24 → 39 of 54 generated held-out drafts, 33 → 34 of 42 v22 cases) but forgot ten
familiar cases (787 → 782 of 801). D3 keeps the 720 new dialogues and the held-out sets of D2 and rehearses the 801
familiar cases twice (2,322 presentations, shuffled by the trainer), from D1 with the same recipe. `prepare.py`
freezes `train.jsonl` and `protocol.json`; `execution.json` is what `Train Petya.app` runs into
`/tmp/petya-andromeda-d3` (D1 results are reused from `../requirements-draft-d2/results`).

## Result: rejected

| | D1 | D2 | D3 |
|---|---|---|---|
| 54 generated held-out drafts | 24 | 39 | 39 (4 D1 successes lost) |
| 42 v22 cases (30 checks + 12 drafts) | 27 + 6 | 27 + 7 | 27 + 6 |
| 801 familiar cases | 787 | 782 | 783 (9 lost, 5 gained) |

The doubled rehearsal keeps D2's gains but barely changes retention: the forgetting does not come from seeing the
familiar cases too rarely. The lost cases mostly drop a secondary constraint («без пояснения», «миграцию не
выполнять», an open question) or garble the grammar. D1 stays the group's D; D3 is published as the pre-release
`andromeda-d3` for comparison. Non-exact drafts were reviewed by meaning (`results/*-review.json`, bound to the
answer's SHA-256); answers already reviewed for D1/D2 reuse that review.
