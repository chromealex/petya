"""Install the optional unified Apple Silicon voice; keep the legacy CPU runtime."""
import json
import pathlib
import platform
import shutil
import subprocess
import sys
import venv
if sys.platform != 'darwin' or platform.machine() != 'arm64' or sys.version_info < (3, 10):
    raise SystemExit('Requires Apple Silicon and Python 3.10+')
root = pathlib.Path(__file__).resolve().parent.parent
venv.EnvBuilder(with_pip=True).create(root / 'runtime/tts-multilingual')
python = root / 'runtime/tts-multilingual/bin/python'
subprocess.run([str(python), '-m', 'pip', 'install', '-r', str(root / 'scripts/multilingual-voice-requirements.txt')], check=True)
model = root / 'runtime/models/qwen-tts-base'
revision = '0d6bb6fe33f92d47a507e23b9148940e8366ab5b'
code = '''
import os,sys
from huggingface_hub import snapshot_download
snapshot_download('mlx-community/Qwen3-TTS-12Hz-0.6B-Base-4bit',revision=sys.argv[2],local_dir=sys.argv[1],allow_patterns=['*.json','*.safetensors','*.txt','*.model'],max_workers=3)
os.environ['HF_HUB_OFFLINE']='1'
from mlx_audio.tts.utils import load_model
load_model(sys.argv[1])
'''
subprocess.run([str(python), '-c', code, str(model), revision], check=True)
shutil.copyfile(root / 'assets/voice-reference-eugene.wav', model / 'reference.wav')
(model / 'READY').write_text(json.dumps({'revision': revision, 'engine': 'mlx-audio==0.6.4'}))
print('Unified Russian/English voice installed. Restart Petya.')
