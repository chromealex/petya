"""Local Qwen ASR worker: PCM in memory, JSON lines, no runtime downloads."""
import base64
import contextlib
import json
import os
import sys
os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'
with contextlib.redirect_stdout(sys.stderr):
    import numpy as np
    from mlx_qwen3_asr import Session
    session = Session(model=sys.argv[1])
print(json.dumps({'ready': True}), flush=True)
for line in sys.stdin:
    request = {}
    try:
        request = json.loads(line)
        data = base64.b64decode(request['audio'], validate=True)
        if len(data) < 44 or len(data) > 4000000 or data[:4] != b'RIFF':
            raise ValueError('Invalid WAV')
        # Main process validates canonical mono PCM16/16kHz before dispatch.
        pcm = np.frombuffer(data, dtype='<i2', offset=44).astype(np.float32) / 32768.0
        with contextlib.redirect_stdout(sys.stderr):
            result = session.transcribe((pcm, 16000), language=None, max_new_tokens=256)
        print(json.dumps({'id': request['id'], 'text': result.text}, ensure_ascii=False), flush=True)
    except Exception as error:
        print(json.dumps({'id': request.get('id'), 'error': str(error)}), flush=True)
