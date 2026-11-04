"""Build a local .app using a persistent signing identity (not a notarized release)."""
import atexit
import json
import os
import pathlib
import plistlib
import shutil
import subprocess
import sys
import tempfile
import re
import socket
import time
import urllib.request

root = pathlib.Path(__file__).resolve().parent.parent
runtime = root / 'node_modules/electron/dist/Electron.app'
destination = root / 'Petya.app'
if os.environ.get('PETYA_MANAGED_BUILD') != '1':
    raise SystemExit('Use python3 scripts/build.py --mac')
if sys.platform != 'darwin' or not runtime.exists():
    raise SystemExit('Requires macOS and an installed Electron runtime (npm start downloads it).')
# Use the same identity for every update. Never silently fall back to ad-hoc.
identity = os.environ.get('PETYA_SIGNING_IDENTITY', '').strip()
if identity != '-':
    identities = subprocess.check_output(['security', 'find-identity', '-v', '-p', 'codesigning'], text=True)
    matches = re.findall(r'\b([A-Fa-f0-9]{40})\s+"([^"]+)"', identities)
    hashes = {fingerprint for fingerprint, name in matches
              if (identity == name or identity.upper() == fingerprint.upper())
              or (not identity and name.startswith('Developer ID Application:'))}
    if len(hashes) != 1:
        raise SystemExit('A unique valid Developer ID Application certificate with its private key is required. '
                         'Install it in Keychain; if several exist, set PETYA_SIGNING_IDENTITY to its SHA-1 fingerprint.')
    identity = hashes.pop()
staging = pathlib.Path(tempfile.mkdtemp(prefix='petya-package-'))
atexit.register(shutil.rmtree, staging, ignore_errors=True)
output = staging / 'Petya.app'
destination.parent.mkdir(parents=True, exist_ok=True)
subprocess.run(['ditto', str(runtime), str(output)], check=True)
resources = output / 'Contents/Resources'
app_dir = resources / 'app'
app_dir.mkdir()
for name in ('src', 'assets'):
    shutil.copytree(root / name, app_dir / name)
subprocess.run(['xcrun', 'swiftc', '-module-cache-path', str(staging / 'swift-cache'), str(root / 'native/claude-send.swift'), '-o', str(app_dir / 'assets/claude-send')], check=True)
subprocess.run(['codesign', '--force', '--sign', identity, str(app_dir / 'assets/claude-send')], check=True)
subprocess.run(['xcrun', 'swiftc', '-module-cache-path', str(staging / 'swift-cache'), str(root / 'native/slack-view.swift'), '-o', str(app_dir / 'assets/native/slack-view')], check=True)
subprocess.run(['codesign', '--force', '--sign', identity, str(app_dir / 'assets/native/slack-view')], check=True)
subprocess.run([sys.executable, str(root / 'scripts/verify-package.py'), str(root / 'src'), str(app_dir / 'src')], check=True)
# Ship the server, its libraries and the multilingual model with the app.
voice = app_dir / 'runtime'
shutil.copytree(root / 'runtime/whisper-build/bin', voice / 'whisper-build/bin', symlinks=True)
(voice / 'models').mkdir()
shutil.copy2(root / 'runtime/models/ggml-base.bin', voice / 'models/ggml-base.bin')
speech_model = 'ggml-base.bin'
if (root / 'runtime/models/ggml-small.bin').exists():
    speech_model = 'ggml-small.bin'
    shutil.copy2(root / 'runtime/models' / speech_model, voice / 'models' / speech_model)
# Build-tree rpaths must not point to the developer's computer.
for binary in (voice / 'whisper-build/bin').iterdir():
    if binary.is_symlink() or not (binary.name == 'whisper-server' or binary.suffix == '.dylib'):
        continue
    info = subprocess.check_output(['otool', '-l', str(binary)], text=True)
    paths = re.findall(r'cmd LC_RPATH\s+cmdsize \d+\s+path (.*?) \(offset', info)
    for old in dict.fromkeys(paths):
        subprocess.run(['install_name_tool', '-delete_rpath', old, str(binary)], check=True)
    subprocess.run(['install_name_tool', '-add_rpath', '@loader_path', str(binary)], check=True)
    subprocess.run(['codesign', '--force', '--sign', identity, str(binary)], check=True)
package = json.loads((root / 'package.json').read_text())
(app_dir / 'package.json').write_text(json.dumps({key: package[key] for key in ('name', 'version', 'main', 'description')}))
info_path = output / 'Contents/Info.plist'
with info_path.open('rb') as stream:
    info = plistlib.load(stream)
info.update(CFBundleName='Petya', CFBundleDisplayName='Петя', CFBundleIdentifier='com.petya.desktop', CFBundleShortVersionString=package['version'], CFBundleVersion=package['version'])
info.update(package['build']['mac']['extendInfo'])
shutil.copy2(root / 'assets/app-icon.icns', resources / 'petya.icns')
info['CFBundleIconFile'] = 'petya.icns'
with info_path.open('wb') as stream:
    plistlib.dump(info, stream)
# Sign with the selected persistent certificate, including nested helpers.
subprocess.run(['xattr', '-cr', str(output)], check=True)
subprocess.run(['codesign', '--force', '--deep', '--sign', identity, str(output)], check=True)
subprocess.run(['codesign', '--verify', '--deep', '--strict', str(output)], check=True)
# Verify the bundled server and model before publishing the archive.
with socket.socket() as probe:
    probe.bind(('127.0.0.1', 0))
    port = probe.getsockname()[1]
with tempfile.TemporaryFile() as log:
    server = subprocess.Popen([str(voice / 'whisper-build/bin/whisper-server'), '-m', str(voice / 'models' / speech_model), '--host', '127.0.0.1', '--port', str(port), '-t', '4'], stdout=log, stderr=log)
    try:
        for attempt in range(90):
            if server.poll() is not None:
                raise RuntimeError('Bundled Whisper exited before becoming ready')
            try:
                with urllib.request.urlopen(f'http://127.0.0.1:{port}/health', timeout=2) as response:
                    if json.load(response).get('status') == 'ok':
                        print('Bundled Whisper server and model verified', flush=True)
                        break
            except (OSError, ValueError):
                pass
            time.sleep(1)
        else:
            raise RuntimeError('Bundled Whisper did not become ready')
    finally:
        server.terminate()
        try:
            server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server.kill()
            server.wait()
# Publish only after signature, source completeness and bundled speech checks pass.
# Stop only the canonical application before replacing its files.
processes = subprocess.check_output(['ps', '-axo', 'pid=,comm='], text=True)
for row in processes.splitlines():
    parts = row.strip().split(None, 1)
    if len(parts) == 2 and parts[1] == str(destination / 'Contents/MacOS/Electron'):
        os.kill(int(parts[0]), 15)
        time.sleep(1)
if destination.exists():
    shutil.rmtree(destination)
shutil.move(str(output), str(destination))
print(destination)
