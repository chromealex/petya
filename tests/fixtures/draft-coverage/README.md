# Coverage review for multi-requirement Jira drafts

This offline experiment uses Petya 0.8.3 and its local qwen3.5:9b Ollama model. It reuses the nine notes in decision-drafts and adds nine held-out variants across three topics in fresh.json. All inputs and review instructions were prepared before generation. Neither the expected values nor the names of the requirements are passed to the model.

1. Run the project's composeDraft implementation with the original discussion.
2. Independently ask the model to extract every settled requirement and open question from the discussion.
3. Give the model its checklist, the original note and the direct draft for correction. If the original draft is invalid, give it the note and checklist with a null draft.

The extraction and review do not use the individual-condition demonstrations from decision-values. Both arms are evaluated from this run. Routes to live Jira are not initialized. The runner supplies a fixture company, an empty team, temperature 0, seed 42 and thinking disabled. For reproduction, launch run.cjs with the project's Electron in Node mode, passing a new file path for JSONL output. The local service must expose qwen3.5:9b on port 11434.

Manual scoring considers the title, description and questions together. A pass requires both fixed requirements, the correct final status and value of the changing condition, with no contradiction or request to reconfirm a settled requirement. Explicitly leaving a decision open in the description suffices. Administrative and implementation questions are not scored unless they contradict the requirements; a passing draft can still contain unnecessary questions. Invalid drafts fail. The same evaluator assessed both arms with method names visible.

| Complete drafts | Direct | Checklist and revision |
|---|---:|---:|
| Previously used notes | 1/9 | 8/9 |
| Fresh notes | 1/9 | 6/9 |
| Total | 2/18 | 14/18 |

The review fixed 12 incomplete drafts and preserved the two complete drafts. Median additional wall time for both calls was 2.01 seconds locally. One direct draft failed field validation and was regenerated from the checklist and source. Four reviewed drafts failed: a tentative storage period became an apparent requirement in two notes; an approved maximum was reopened in another; a maximum of five became exactly five in the last. Extracting an open issue did not always prevent the writer from copying a contradictory original draft.

The experiment covers six synthetic topics, each repeated with three endings, and one generation per arm. It measures requirement coverage rather than readiness to submit an issue without editing. No changes were made to the production drafting path or model weights.
