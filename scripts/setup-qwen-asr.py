"""Install Qwen3-ASR 1.7B MLX beside Petya; no downloads during dictation."""
import json
import pathlib
import platform
import subprocess
import sys
import venv

if sys.platform != 'darwin' or platform.machine() != 'arm64' or sys.version_info < (3, 10):
    raise SystemExit('Requires Apple Silicon and Python 3.10+')
root = pathlib.Path(__file__).resolve().parent.parent
venv.EnvBuilder(with_pip=True).create(root / 'runtime/asr')
python = root / 'runtime/asr/bin/python'
subprocess.run([str(python), '-m', 'pip', 'install', '-r', str(root / 'scripts/qwen-asr-requirements.txt')], check=True)
model = root / 'runtime/models/qwen3-asr-1.7b'
revision = 'a8379a2e2f9e313c9292cdf1af4055ab56d50d55'
code = '''
import os,sys,json
from pathlib import Path
os.environ['HF_HUB_DISABLE_TELEMETRY']='1'
from huggingface_hub import snapshot_download
snapshot_download('mlx-community/Qwen3-ASR-1.7B-8bit',revision=sys.argv[2],local_dir=sys.argv[1],allow_patterns=['*.json','*.safetensors','*.txt','*.model'],max_workers=3)
os.environ['HF_HUB_OFFLINE']='1'
from mlx_qwen3_asr import Session
session=Session(model=sys.argv[1])
Path(sys.argv[1],'READY').write_text(json.dumps({'model':'Qwen3-ASR-1.7B-8bit','revision':sys.argv[2],'engine':'mlx-qwen3-asr==0.4.4'}))
print('Qwen3-ASR 1.7B is ready. Restart Petya.')
'''
subprocess.run([str(python), '-c', code, str(model), revision], check=True)
