"""Offline Silero (Russian) and Kokoro Fenrir (English) worker. JSON lines on stdin/stdout; never downloads at runtime."""
import base64
import contextlib
import io
import json
import textwrap
import sys
import wave
from pathlib import Path
from voice_languages import language_parts

with contextlib.redirect_stdout(sys.stderr):
    import torch
    torch.set_num_threads(4)
    model = torch.package.PackageImporter(sys.argv[1]).load_pickle('tts_models', 'model')
    model.to(torch.device('cpu'))
    models = {'ru': model}


def synthesize(language, text):
    if language == 'ru':
        return model.apply_tts(text=text, speaker='eugene', sample_rate=48000)
    if 'en' not in models:
        folder = Path(sys.argv[1]).parent / 'kokoro'
        if not all((folder / name).exists() for name in ('kokoro-v1.0.onnx', 'voices-v1.0.bin')):
            raise ValueError('Английский голос Fenrir не установлен. Запусти scripts/setup-voice.py.')
        from kokoro_onnx import Kokoro
        models['en'] = Kokoro(str(folder / 'kokoro-v1.0.onnx'), str(folder / 'voices-v1.0.bin'))
    from scipy.signal import resample_poly
    import math
    audio, rate = models['en'].create(text, voice='am_fenrir', speed=1.0, lang='en-us')
    divisor = math.gcd(48000, rate)
    # Band-limited conversion preserves pitch and duration when joining both voices.
    return torch.from_numpy(resample_poly(audio, 48000 // divisor, rate // divisor).copy())

for line in sys.stdin:
    try:
        request = json.loads(line)
        text = request['text']
        if not isinstance(text, str) or not text.strip() or len(text) > 12000:
            raise ValueError('Invalid speech text')
        with contextlib.redirect_stdout(sys.stderr), torch.inference_mode():
            parts = [torch.zeros(2400)]
            # Keep ordinary sentences together; never split a word at the size limit.
            chunks = [(language, chunk) for language, segment in language_parts(text)
                      for chunk in textwrap.wrap(segment, width=350, break_long_words=False, break_on_hyphens=False)]
            for index, (language, chunk) in enumerate(chunks):
                if chunk[-1] not in '.!?;:…':
                    chunk += '.'
                parts.append(synthesize(language, chunk))
                if index < len(chunks) - 1:
                    parts.append(torch.zeros(3840))
            # Silence outside the waveform protects consonants at playback boundaries.
            parts.append(torch.zeros(9600))
            audio = torch.cat(parts)
        output = io.BytesIO()
        with wave.open(output, 'wb') as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(48000)
            wav.writeframes((audio.clamp(-1, 1).numpy() * 32767).astype('<i2').tobytes())
        print(json.dumps({'audio': base64.b64encode(output.getvalue()).decode('ascii')}), flush=True)
    except Exception as error:
        print(json.dumps({'error': str(error)}), flush=True)
