"""Run with Python 3.10–3.12 to install the offline voice beside Petya."""
import hashlib
import pathlib
import subprocess
import sys
import urllib.request
import venv

root = pathlib.Path(__file__).resolve().parent.parent
if not (3, 10) <= sys.version_info[:2] <= (3, 12):
    raise SystemExit('Use Python 3.10–3.12 for the local voice.')
env = root / 'runtime/tts'
venv.EnvBuilder(with_pip=True).create(env)
python = env / ('Scripts/python.exe' if sys.platform == 'win32' else 'bin/python')
subprocess.run([str(python), '-m', 'pip', 'install', 'torch==2.8.0', 'numpy==2.2.6', 'kokoro-onnx==0.6.1', 'scipy==1.15.3'], check=True)
model = root / 'runtime/models/petya-voice.pt'
model.parent.mkdir(parents=True, exist_ok=True)
expected = 'f036d3da1584899e5e24bdf2d5bd3bcf896e2d62505de39a02caca76014d7a1c'
if not model.exists() or hashlib.sha256(model.read_bytes()).hexdigest() != expected:
    temporary = model.with_suffix('.download')
    try:
        urllib.request.urlretrieve('https://models.silero.ai/models/tts/ru/v5_3_ru.pt', temporary)
        if hashlib.sha256(temporary.read_bytes()).hexdigest() != expected:
            raise RuntimeError('Voice model checksum mismatch')
        temporary.replace(model)
    finally:
        if temporary.exists(): temporary.unlink()
kokoro = root / 'runtime/models/kokoro'
kokoro.mkdir(parents=True, exist_ok=True)
for name, checksum in [
    ('kokoro-v1.0.onnx', 'beb0d1848dee9a49da392cc3df26958d46cfa35d321edf434f52949153f0df3a'),
    ('voices-v1.0.bin', 'bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d'),
]:
    target = kokoro / name
    if target.exists() and hashlib.sha256(target.read_bytes()).hexdigest() == checksum:
        continue
    temporary = target.with_suffix('.download')
    try:
        urllib.request.urlretrieve('https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/' + name, temporary)
        if hashlib.sha256(temporary.read_bytes()).hexdigest() != checksum:
            raise RuntimeError('Kokoro voice model checksum mismatch')
        temporary.replace(target)
    finally:
        if temporary.exists(): temporary.unlink()
print('Local Russian Eugene and English Fenrir installed. Restart Petya.')
