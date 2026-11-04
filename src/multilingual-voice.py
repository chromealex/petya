"""Offline bilingual TTS using one synthetic reference voice for both languages."""
import base64
import contextlib
import io
import json
import os
import re
import sys
import textwrap
import wave
from pathlib import Path
from voice_numbers import spoken_numbers
from voice_language import detect_languages, missing_languages, load_numbers, CATALOG

os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'
with contextlib.redirect_stdout(sys.stderr):
    import numpy as np
    import mlx.core as mx
    from mlx_audio.tts.utils import load_model
    model = load_model(sys.argv[1])
reference = str(Path(sys.argv[1]) / 'reference.wav')
for line in sys.stdin:
    try:
        request=json.loads(line)
        text = request['text']
        if not isinstance(text, str) or not text.strip() or len(text) > 12000:
            raise ValueError('Invalid speech text')
        directory=os.environ.get('PETYA_LANGUAGES_DIR','')
        missing=missing_languages(text,directory,request.get('language','ru'))
        if missing: raise ValueError('Сначала установи язык: '+', '.join(item['label'] for item in missing))
        languages=detect_languages(text,request.get('language','ru'))
        code=languages[0]
        for language_code in languages: load_numbers(language_code,directory)
        language='auto' if len(languages)>1 else {'ru':'russian','en':'english',**{key:item['model'] for key,item in CATALOG.items()}}[code]
        normalized=spoken_numbers(text,code)
        with contextlib.redirect_stdout(sys.stderr):
            mx.random.seed(42)
            results = []
            for chunk in textwrap.wrap(normalized, width=350, break_long_words=False, break_on_hyphens=False):
                generated = list(model.generate(text=chunk, ref_audio=reference,
                    ref_text='Привет, я здесь. С какого проекта начнём?',
                    lang_code=language, temperature=.6, max_tokens=1024, verbose=False))
                if any(result.token_count >= 1024 for result in generated):
                    raise ValueError('Speech generation limit reached; answer was not played')
                results.extend(generated)
            if not results:
                raise ValueError('Empty synthesis')
            audio = np.concatenate([np.asarray(result.audio) for result in results])
            rate = results[0].sample_rate
            if not np.isfinite(audio).all():
                raise ValueError('Invalid audio')
        output = io.BytesIO()
        with wave.open(output, 'wb') as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(rate)
            wav.writeframes((np.clip(audio, -1, 1) * 32767).astype('<i2').tobytes())
        print(json.dumps({'audio': base64.b64encode(output.getvalue()).decode('ascii')}), flush=True)
    except Exception as error:
        print(json.dumps({'error': str(error)}), flush=True)
