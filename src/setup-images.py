"""Install the isolated local image runtime. Run with Python 3.10–3.12."""
import os
import pathlib
import shutil
import subprocess
import sys
import venv

root = pathlib.Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else pathlib.Path(__file__).resolve().parent.parent
root.mkdir(parents=True, exist_ok=True)
def progress(phase):
    print('PETYA_PHASE:' + phase, flush=True)
if not (3, 10) <= sys.version_info[:2] <= (3, 12):
    raise SystemExit('Use Python 3.10–3.12.')
if shutil.disk_usage(root).free < 6 * 1024**3:
    raise SystemExit('Для установки освободите не менее 6 ГБ на диске с Петей.')
env = root / 'runtime/images'
progress('environment')
venv.EnvBuilder(with_pip=True).create(env)
python = env / ('Scripts/python.exe' if sys.platform == 'win32' else 'bin/python')
progress('dependencies')
subprocess.run([str(python), '-m', 'pip', 'install', '--no-cache-dir', 'torch==2.8.0', 'diffusers==0.35.1', 'transformers==4.56.2', 'accelerate==1.10.1', 'safetensors==0.6.2', 'Pillow==11.3.0'], check=True)
progress('model')
model = root / 'runtime/models/sd-turbo'
subprocess.run([str(python), '-c', '''
import sys
from huggingface_hub import snapshot_download
snapshot_download('stabilityai/sd-turbo', local_dir=sys.argv[1], allow_patterns=['model_index.json', '*/config.json', 'scheduler/*', 'tokenizer/*', '*/*.fp16.safetensors'])
''', str(model)], check=True, env=dict(os.environ, HF_HUB_DISABLE_TELEMETRY='1'))
progress('verifying')
subprocess.run([str(python), '-c', "from diffusers import AutoPipelineForText2Image; import sys; AutoPipelineForText2Image.from_pretrained(sys.argv[1], variant='fp16', use_safetensors=True, local_files_only=True)", str(model)], check=True, env=dict(os.environ, HF_HUB_OFFLINE='1', HF_HUB_DISABLE_TELEMETRY='1'))
(model / '.petya-ready').write_text('stabilityai/sd-turbo\n', encoding='utf-8')
print('Local SD-Turbo installed. No network is used during generation.')
