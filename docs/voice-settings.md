# Voice and personal settings

German, French, Spanish, Italian, Portuguese, Japanese and Korean are optional resources. Settings download each language explicitly into Electron userData/voice-languages. No optional resource is bundled or downloaded on startup. Each resource comes from the pinned num2words v0.5.14 release and is verified against SHA-256 before use. The existing multilingual Qwen voice weights are shared. The multilingual Python runtime requires langdetect 1.0.9 and six 1.17.0.

Detected missing languages produce an installation offer beside the answer. Declining leaves the text available. Installation does not rerun the original command; playback can be requested afterward. Detection is conservative for short names and may not identify very short foreign phrases.

Name settings support familiar forms specific to each name, custom aliases and persistent excluded forms. Direct requests such as “Не называй меня Санёк” (Don't call me Sanyok) update the exclusion setting before routing to a model. Matching ignores case and the Russian е/ё distinction. Exclusions apply across chats and are editable in settings. Names remain blank by default. Familiar forms and optional informal openings depend on the selected speech style.

Speech cleanup omits commit hashes, UUIDs, URLs and markup while preserving visible answers and meaningful numbers. Recognized nonlexical filler and punctuation-only noise are discarded without submitting a chat request or asking the speaker to repeat.

Focused checks: tests/spoken-text.cjs, tests/name-profile.cjs, tests/language-packs.cjs, tests/speech-transcript.cjs, tests/audio-parallel.cjs, tests/voice_language.py, and the Electron smoke test (including tests/voice-languages-ui.cjs).

Microphone dictation emits overlapping fragments during continuous speech after 2.5 seconds (meeting capture retains the 8-second default). Recognized partial commands can speculatively classify the conversation topic. This preparation never executes tools or writes chat history. It is single-flight, coalesces newer fragments, and reuses a result only for an exact final transcript and unchanged conversation/settings context. Actual commands still wait for the end of the utterance.
