# Recognition during dictation

AudioListener sends a chunk after 650 ms of silence or after 8 seconds of continuous speech. A short 180 ms pause no longer cuts a phrase. Recording continues during recognition. When a chunk is cut forcibly, 400 ms of overlap are kept; matching words at the boundary are removed during assembly. This is a heuristic: inaccurate recognition of words at the seam may leave a repetition.

Up to four chunks are processed at the same time, and results are published in recording order. The limit is chosen based on the computer's resources: four with ≥32 GB RAM and ≥16 available CPUs, two with ≥16 GB and ≥8 CPUs, otherwise one. This is a conservative heuristic, not an automatic benchmark. SpeechPool warms up additional local whisper-server instances with the same model on free loopback ports: a single Whisper server blocks parallel inference requests with a mutex. Each process uses the standard four compute threads; each additional process needs memory for the model. If an additional runtime is unavailable, requests are executed sequentially by the main server. An external server is not stopped when Petya quits.

VoiceTurn accumulates the parts of one command and waits for speech and all recognitions to finish before executing it. The pause after a finished phrase is 1.2 seconds instead of 1.8. While the tail is being processed, «Распознаю последние слова…» ("Recognizing the last words…") is shown instead of «Дослушиваю» ("Still listening"). If recognition has not finished within 12 seconds after the last activity or result, the command is cancelled and the microphone is stopped; a partially recognized request is not executed. Continuous activity/noise is limited to 60 seconds per command. Late results from a stopped recording are discarded. Intermediate words do not trigger actions. While Petya is answering, its own voice and stale results are ignored. On stop/restart, old results do not get into the new recording. The queue is limited to eight chunks; overload is reported explicitly.

Tests: tests/audio-parallel.cjs, tests/audio-onset.cjs, tests/speech.cjs, tests/voice-turn.cjs. Real latencies depend on the model, GPU/CPU and the length of speech; parallelism does not guarantee a twofold speedup.

## Measurement of 4 November 2026

Apple M3 Ultra, 96 GB RAM, 28 CPUs, ggml-base. The same 4-second chunk with real speech, mono PCM 16 kHz; a queue of 12 requests after warm-up, median of three runs. The text was checked.

| Workers | Whole queue | Median single request |
|---|---:|---:|
| 1 | 1110 ms | 92 ms |
| 2 | 588 ms | 98 ms |
| 3 | 447 ms | 112 ms |
| 4 | 323 ms | 107 ms |

This measures Whisper throughput on a single recording, excluding server startup time, speech capture and the language model's response. More workers help when there is a queue; the latency of a single request may increase.

Chunks with Whisper tags such as «[музыка]» ("[music]"), «[шум]» ("[noise]") and similar are not executed as commands. For audio up to five seconds long, the dictionary of names/terms is not mixed in; temperature fallback is disabled. Text arriving from Whisper is not counted as new speech activity and does not extend the wait from the current time. The remainder of the audio buffer is tracked separately from fresh microphone activity.

When the microphone is turned on manually (with the button or from the tray), a device picker opens. The last successfully started input is remembered locally and offered the next time; recording starts after the «Включить» (Turn on) button. If the device has disappeared, another one must be chosen explicitly. Capture uses the exact deviceId, and the name of the selected input is shown in the status. Cancel/Escape do not start recognition. The list is updated when devices are connected and disconnected. When device names are missing, Chromium briefly opens and immediately closes a stream to obtain the list; this stream is not passed to recognition.

## Protection against false commands

After an ordinary answer there is no longer an automatic arm: a new utterance requires «Петя» ("Petya"). The exception is an explicitly expected answer to a clarifying question (voiceReply). This prevents commands from being triggered by a random transcription after speech playback.

Before live recognition, PCM16 mono 16 kHz is checked: complete digital silence and isolated impulses (fewer than 320 non-zero PCM samples) are not sent to Whisper. The repeated RMS threshold and pause trimming have been removed: the extra check was discarding quiet/short speech. The original samples and pauses are kept. This is not a neural-network VAD. The hint with the list of team names, which could influence the recognition of noise, has been removed from live requests. Repetitions of a single word/short phrase and the characteristic subtitle-credits block «редактор субтитров … корректор» ("subtitle editor … proofreader") are rejected entirely, without executing the remaining prefix. Ordinary requests about subtitles and short repetitions are kept. The original audio recording of the user's failure was not saved, so these filters were tested on test PCM and on transcriptions from screenshots rather than on the original sound.

While TTS audio is being prepared, the microphone keeps recognizing speech. Suppression of Petya's own voice is enabled before playback and removed after it. An empty transcription is shown in «Последней реплике» ("Last utterance") even without an active command.


## Short Russian phrases: test of 4 November 2026

The multilingual Whisper Small model (SHA-1 `55356645c2b361a969dfd0ef2c5a50d530afd8d5`) has been added to the macOS build and is selected instead of the bundled Base. User paths to models are kept; without Small, Base remains. Model source: https://huggingface.co/ggerganov/whisper.cpp.

On six phrases synthesized with Silero («Как дела?» ("How are you?"), «Петя, как дела?» ("Petya, how are you?"), «Ты здесь?» ("Are you there?"), «Какие проекты у тебя есть?» ("What projects do you have?"), «Проверь почту.» ("Check the mail."), «Не создавай задачу.» ("Don't create a task.")), Small with greedy decoding recognized the words in 6/6 and Base in 5/6; punctuation and case were not taken into account. Request time was 64–275 ms for Small and 31–73 ms for Base after the model was loaded. Beam 5 did not improve the Small result and gave 4/6 for Base, so the search settings were left unchanged. This is not a test of a live microphone and not a measurement of the full response time.

Background recognition statuses no longer override the status of a command being executed. Errors are still displayed.
