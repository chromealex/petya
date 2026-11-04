"""Generate local Kokoro candidates, preceded by the same Russian Eugene sample.
Run with runtime/voice-preview/bin/python after installing kokoro-onnx and soundfile.
Does not modify the active Petya voice.
"""
import json
import time
from pathlib import Path
import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

root = Path(__file__).resolve().parent.parent
output = root / 'docs/voice-comparison'
output.mkdir(parents=True, exist_ok=True)
model = root / 'runtime/models/kokoro'
k = Kokoro(str(model / 'kokoro-v1.0.onnx'), str(model / 'voices-v1.0.bin'))
text = "Hello, I'm here. I'll check the project in Slack and send you a short update. Which task should we start with?"
ru, ru_rate = sf.read(output / 'eugene.wav', dtype='float32')
results = []
for voice, language in [('am_michael', 'en-us'), ('am_fenrir', 'en-us'), ('bm_george', 'en-gb')]:
    start = time.monotonic()
    audio, rate = k.create(text, voice=voice, speed=1.0, lang=language)
    seconds = time.monotonic() - start
    assert len(audio) > rate and np.isfinite(audio).all() and np.max(np.abs(audio)) > .01
    sf.write(output / (voice + '.wav'), audio, rate, subtype='PCM_16')
    # The reference is 48kHz; Kokoro is 24kHz. Downsample only the reference.
    assert ru_rate == rate * 2
    combined = np.concatenate([ru[::2], np.zeros(int(rate*.5)), audio])
    sf.write(output / (voice + '-comparison.wav'), combined, rate, subtype='PCM_16')
    result = {'voice': voice, 'text': text, 'synthesis_seconds': round(seconds, 3), 'audio_seconds': round(len(audio)/rate, 3)}
    results.append(result)
    print(json.dumps(result), flush=True)
(output / 'results.json').write_text(json.dumps(results, indent=2))
