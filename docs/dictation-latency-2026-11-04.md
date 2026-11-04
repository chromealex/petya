# Dictation latency benchmark — 2026-11-04

The new draft path improves some responses, but does not consistently shorten every turn. Two correction scenarios still fail semantically in both modes.

## Method

Eight scenarios, each replayed once with preparation disabled and once enabled. Runs alternate order. The selected local model was Qwen3.5 9B. ASR and TTS were warmed before measurement. The test uses isolated Electron smoke settings without connected work accounts.

Synthetic Silero Eugene recordings are fed at real-time speed through a WebAudio MediaStream, the production AudioListener, Qwen ASR, VoiceTurn, IPC conversation handler and production speech playback. Only the physical-microphone permission preflight is bypassed. Output audio is muted; the measured voice event is HTMLAudioElement `playing`, not acoustic speaker onset. End of speech is the last fixture sample after trimming silence with a 10 ms margin. Browser scheduling jitter is retained in the JSON.

The reference path disables `prepareVoice`; it keeps the same 2.5-second ASR segmentation and end-of-turn policy. Text means the complete answer, not its first streamed token. Different generated answer lengths affect TTS duration, so voice timings are not an equal-text synthesis comparison. This is one paired exploratory pass, not a p95 or SLA estimate, and not a live microphone test.

## Results

Seconds after end of speech; B = no preparation, D = draft preparation.

| Scenario | Text B | Text D | Voice B | Voice D | Outcome |
| --- | ---: | ---: | ---: | ---: | --- |
| «Ты здесь?» | 1.98 | 1.93 | 4.73 | 4.73 | Correct presence reply |
| Why the sky is blue | 2.25 | 1.96 | 8.40 | 7.65 | Correct main explanation |
| Java → JavaScript | 3.02 | 2.13 | 8.70 | 6.13 | Correct changed topic |
| 10 + 5 → 10 + 7 | 2.54 | 2.84 | 4.73 | 5.04 | Both answer 17; draft is slower |
| Project Alpha → Beta | 2.90 | 3.04 | 9.77 | 10.33 | Both incorrectly focus on Alpha and expose tool-selection wording |
| Long stable request, 15.3 s | 2.81 | 1.90 | 7.99 | 7.64 | Correct main distinction; draft answer available almost immediately after dispatch |
| Late Java → JavaScript correction, 14.8 s | 2.43 | 2.25 | 6.93 | 6.54 | Changed topic followed, but both add an unwanted comparison with Java |
| Create Jira task → do not create | — | — | — | — | Both return to action routing without a conversational answer, about 1.40 s after speech |

Among the six scenarios passing the main-topic check, complete-text medians are 2.48 s → 2.05 s (about 18% lower); playback-start medians are 7.46 s → 6.34 s (about 15% lower). This subset excludes the two semantic failures and is not an overall success-rate claim. Keyword-level checks pass in 12 of 16 final runs. Manual review additionally flags the unwanted Java comparison in both late-correction answers.

No measured first text or playback event occurred before the end of input speech. Long-input logs show background preparation before speech ended. End-of-turn dispatch remains about 1.8 s at the median; synthesis/playback preparation contributes much of the remaining delay. ASR joins also contain duplicated or distorted overlap words in the long example.

## Failed cases and limits

- Project correction: ASR contains both names and the correction, yet the response asks about Alpha and leaks internal tool choices. Failure also occurs without drafting; do not interpret the fast response as correct handling of the correction.
- Cancelled action: ASR contains the prohibition, but the conversational route returns `handled:false`. The benchmark stops there and does not run the action planner or external services. No completed conversational reply is counted for this case.
- Late topic correction: the response is about JavaScript but still mentions Java despite the explicit exclusion.
- The initial Russian-only synthesizer omitted Latin names. Those topic-correction recordings were discarded and regenerated with phonetic Russian spellings of Java, JavaScript and Jira. The original action runs are also superseded by corrected recordings and explicit classification of the unhandled action result. Raw and corrected reports remain available for audit; use the merged summary for comparison.

## Reproduction

From the repository root:

```sh
runtime/tts/bin/python tests/dictation-latency-audio.py /private/tmp/petya-dictation-benchmark-audio
env -u ELECTRON_RUN_AS_NODE PETYA_SMOKE_TEST=1 PETYA_E2E_LATENCY=1 node_modules/electron/dist/Electron.app/Contents/MacOS/Electron .
```

Use `PETYA_LATENCY_CASES` for comma-separated scenario IDs, `PETYA_TEST_MODEL` to select a model, and `PETYA_LATENCY_REPORT` to choose the report path. `PETYA_AUDIO_CASES` regenerates selected synthetic fixtures. Audio stays outside the repository and no optional language resources are installed by the benchmark.

Reports: `tests/results/dictation-latency-summary.json` is the merged valid-run summary; `dictation-latency-live.json` and `dictation-latency-corrected-fixtures.json` contain the original measurements, transcripts, preparations, answers and timestamps.
