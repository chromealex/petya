# Paired demonstrations during Jira draft review

The configured Petya 0.8.3 model (qwen3.5:9b on local Ollama) reviewed a shared direct draft and a shared extracted checklist for each note. Both arms used the draft-coverage review instruction, sampling settings and source discussion. The candidate alone saw six demonstration turns: three pairs of complete drafts covering pending vs approved values, a maximum vs an exact count, and a proposal replaced with a lower limit. Demonstrations were added only during final review. Neither arm received grading labels. The order of the two reviews alternated.

Before running inference we stored the six demonstrations and nine new notes (three different topics with three endings) in data.json. Separately we replayed the four previously failed notes from draft-coverage. The model regenerated the direct draft, checklist and both reviews for each, so the baseline score on previously failed notes may change on replay. The training gate was an increase in complete drafts on the fresh set.

Manual review used shuffled outputs with method names hidden. To pass, a draft had to preserve both fixed requirements, the final decision status and the exact scope of the value across title, description and questions. Adding an unsupported lower bound or asking to choose again after a decision fails. Unnecessary administrative or implementation questions do not independently fail a draft. This measures coverage, not general writing quality.

| Complete drafts | Current coverage review | Review with pairs |
|---|---:|---:|
| Fresh | 7/9 | 7/9 |
| Previously failed, replayed | 2/4 | 3/4 |

On fresh notes both arms missed the same two cases. The paired baker's draft respected the maximum of three but invented a minimum of one. The paired tour draft required exactly seven participants in its description, then asked if the original nine-person proposal should take priority. On replay the examples improved the key-issuance note: the proposed retention period remained an open question. The shelf limit of eight was still missing.

The training gate was not reached. No adapter was trained and no production behavior changed. This small, correlated sample is one paired run; it cannot establish equivalence. To repeat, run run.cjs via Electron as Node with a fresh JSONL output path and the configured local service.
