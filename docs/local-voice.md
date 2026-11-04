# Local voice

## Unified Russian and English voice on Apple Silicon

The current local installation uses Qwen3-TTS 12Hz 0.6B Base, MLX 4-bit, through `mlx-audio==0.6.4`. Both languages use the same synthetic Eugene reference (`assets/voice-reference-eugene.wav`, transcript: «Привет, я здесь. С какого проекта начнём?» (Hi, I'm here. Which project shall we start with?)). This replaces switching between Silero Eugene and Kokoro Fenrir. The reference was synthesized by Silero, not recorded from a person.

Install with Python 3.10+: `python3 scripts/setup-multilingual-voice.py`. The isolated environment is `runtime/tts-multilingual`; model weights, reference and READY marker are in `runtime/models/qwen-tts-base`. Model revision: `0d6bb6fe33f92d47a507e23b9148940e8366ab5b`. Dependencies are pinned in `scripts/multilingual-voice-requirements.txt`. These runtime files remain beside the application; copying Petya.app alone does not transfer the installation.

The worker loads once and stays alive between replies. Requests and WAV responses travel in memory through JSON lines; normal answers are not saved to disk. Runtime inference sets HF_HUB_OFFLINE=1. Russian-only and English-only requests explicitly select their language. Mixed sentences use automatic language selection without splitting every language change into a separate voice. Long text is split at word boundaries. Hitting the generation token cap is an error rather than silently returning truncated speech. Stop terminates the worker and cancels the pending reply.

Sources: https://huggingface.co/mlx-community/Qwen3-TTS-12Hz-0.6B-Base-4bit ; https://github.com/Blaizzy/mlx-audio ; https://huggingface.co/Qwen/Qwen3-TTS-12Hz-0.6B-Base . Qwen weights use Apache-2.0. The synthetic reference originates from the existing Silero model, whose license is CC BY-NC 4.0; installing Qwen does not remove that restriction from the reference.

## Number pronunciation and playback

`voice_numbers.py` expands numeric tokens with num2words 0.5.14 before synthesis. Counts, zero, multi-component versions, leading-zero identifiers, negatives and grouped thousands are preserved in spoken form. Decimal components are read explicitly as point plus fractional digits; no rounding is applied. The displayed answer is unchanged.

Both ordinary and streamed replies play at their natural 1.0 rate. Browser time compression at 1.15 is removed. Audio completion and stall watchdogs still release microphone capture and support follow-up replies.

## Legacy CPU runtime

If the unified installation is absent, the existing `runtime/tts` worker remains available: Silero v5_3_ru Eugene for Russian and Kokoro am_fenrir for English. `scripts/setup-voice.py` installs it. This path also expands numbers; language transitions no longer insert periods and use a 20 ms gap. It still has two distinct timbres. An error in an installed unified model is surfaced, not silently retried with another voice.

## Validation, 2026-11-04

Recordings and ASR transcripts are in `docs/voice-quality`. Before correction, the Russian test omitted numeric values. The corrected legacy path preserved version 1.19.0, zero bugs, twelve tasks, three open and twenty-five percent. An initial unified trial using auto-language for English was recognized as version 1.10.0; explicit English corrected this. Forced Russian for mixed speech changed Slack to slick in ASR; mixed-language auto selection was retained.

The final production adapter generated Russian, mixed and English samples in approximately 5.1 s (first request including loading), 2.3 s and 1.8 s respectively on this Mac. These timings are synthesis only. Automated recognition checks intelligibility, not subjective timbre similarity or naturalness.

Checks: `runtime/tts/bin/python tests/voice_numbers.py`, `node tests/local-voice.cjs`, `node tests/local-voice-ui.cjs`, `node tests/voice-conversation.cjs`, and Electron `tests/local-voice-playback.cjs`. The browser playback test verifies natural speed, completion, capture re-arming and resource cleanup. Real production-adapter fixtures are saved as `final-*.wav` with recognition in `final-recognition.json`.
