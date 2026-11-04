# Qwen3-ASR in Petya

Engine for Apple Silicon: `mlx-qwen3-asr==0.4.4`, Qwen3-ASR 1.7B in 8-bit MLX format. Pinned dependencies: `scripts/qwen-asr-requirements.txt`. Converted model: https://huggingface.co/mlx-community/Qwen3-ASR-1.7B-8bit , revision `a8379a2e2f9e313c9292cdf1af4055ab56d50d55`. Engine: https://github.com/moona3k/mlx-qwen3-asr . Original model: https://huggingface.co/Qwen/Qwen3-ASR-1.7B .

Installation on a Mac with Apple Silicon and Python 3.10+: `python3 scripts/setup-qwen-asr.py`. The environment is in `runtime/asr`, the model in `runtime/models/qwen3-asr-1.7b`. The READY marker is created after the model loads successfully. The installation lives beside the application; moving Petya.app alone does not move Python and the weights.

If the local installation is ready, voice input selects Qwen; otherwise the previous Whisper remains. Errors of an already selected Qwen are shown explicitly, without silently switching to another model. The microphone indicator shows the active engine. Spoken replies are not affected by this choice.

The model lives in a single child process. WAV is passed through stdin in memory; voice commands are not written to disk. The worker process runs with HF_HUB_OFFLINE=1. Each request has its own ID; process exit and timeouts release pending waits. At this stage, recognition of accumulated fragments after pauses is used; Qwen's native streaming API is not yet connected.

Checks: `node tests/qwen-speech.cjs`; integration checks of the input field — `tests/current-question-ui.cjs` and the general Electron smoke test. Sent text remains in the history and the field is cleared; a new draft being typed is kept, and on error an empty field restores the request.

Local run 2026-11-04: the synthesized phrases «Петя, ты тут?» (Petya, are you there?) (1.787 s, punctuation — a period), «Какие проекты у тебя есть?» (What projects do you have?) (0.235 s) and an English phrase (0.332 s) were recognized without losing words. The first phrase includes the first model call; the following ones use the warmed-up process. Silence and quiet random noise produced empty text. Results: `docs/qwen-asr-results.json`. This is the time of recognition itself, without waiting for the pause and the assistant's reply. Synthetic recordings do not replace testing live speech through a microphone.
