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
# A release build (PETYA_RELEASE_SIGN=1, the Release workflow) is notarized by Apple: every binary gets the hardened
# runtime and a secure timestamp, and the app keeps the entitlements Electron and the microphone need under it.
release = os.environ.get('PETYA_RELEASE_SIGN') == '1'
entitlements = root / 'scripts/entitlements.mac.plist'
def sign(path, deep=False):
    command = ['codesign', '--force'] + (['--deep'] if deep else []) + ['--sign', identity]
    if release:
        command += ['--options', 'runtime', '--timestamp', '--entitlements', str(entitlements)]
    subprocess.run(command + [str(path)], check=True)
def macho(path):
    with path.open('rb') as stream:
        return stream.read(4) in (b'\xcf\xfa\xed\xfe', b'\xce\xfa\xed\xfe', b'\xca\xfe\xba\xbe', b'\xbe\xba\xfe\xca')
staging = pathlib.Path(tempfile.mkdtemp(prefix='petya-package-'))
atexit.register(shutil.rmtree, staging, ignore_errors=True)
output = staging / 'Petya.app'
destination.parent.mkdir(parents=True, exist_ok=True)
subprocess.run(['ditto', str(runtime), str(output)], check=True)
resources = output / 'Contents/Resources'
app_dir = resources / 'app'
app_dir.mkdir()
for name in ('assets',):
    shutil.copytree(root / name, app_dir / name)
subprocess.run(['xcrun', 'swiftc', '-module-cache-path', str(staging / 'swift-cache'), str(root / 'native/claude-send.swift'), '-o', str(app_dir / 'assets/claude-send')], check=True)
sign(str(app_dir / 'assets/claude-send'))
subprocess.run(['xcrun', 'swiftc', '-module-cache-path', str(staging / 'swift-cache'), str(root / 'native/slack-view.swift'), '-o', str(app_dir / 'assets/native/slack-view')], check=True)
sign(str(app_dir / 'assets/native/slack-view'))
subprocess.run(['xcrun', 'swiftc', '-module-cache-path', str(staging / 'swift-cache'), str(root / 'native/watch-macos.swift'), '-o', str(app_dir / 'assets/native/watch-macos')], check=True)
sign(str(app_dir / 'assets/native/watch-macos'))
# Capture UI and application code after native compilation to minimize concurrent-edit races.
shutil.copytree(root / 'src', app_dir / 'src')
# Copy the exact production dependency tree, including nested versions.
packages = json.loads((root / 'package-lock.json').read_text())['packages']
for location, metadata in packages.items():
    if location.startswith('node_modules/') and not metadata.get('dev'):
        shutil.copytree(root / location, app_dir / location, dirs_exist_ok=True,
                        ignore=shutil.ignore_patterns('node_modules'))
subprocess.run([sys.executable, str(root / 'scripts/verify-package.py'), str(root / 'src'), str(app_dir / 'src')], check=True)
# Ship the server, its libraries and the multilingual model with the app.
voice = app_dir / 'runtime'
shutil.copytree(root / 'runtime/whisper-build/bin', voice / 'whisper-build/bin', symlinks=True)
(voice / 'models').mkdir()
# Only the base speech model ships (142 MB); the app downloads «small» (466 MB) on first start
# (src/speech-model-download.cjs) and switches to it once it is verified.
speech_model = 'ggml-base.bin'
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
    sign(str(binary))
package = json.loads((root / 'package.json').read_text())
(app_dir / 'package.json').write_text(json.dumps({key: package[key] for key in ('name', 'version', 'main', 'description')}))
info_path = output / 'Contents/Info.plist'
with info_path.open('rb') as stream:
    info = plistlib.load(stream)
info.update(CFBundleName='Petya', CFBundleDisplayName='Петя', CFBundleIdentifier='com.petya.desktop', CFBundleShortVersionString=package['version'], CFBundleVersion=package['version'])
info.update(package['build']['mac']['extendInfo'])
shutil.copy2(root / 'assets/app-icon.icns', resources / 'petya.icns')
info['CFBundleURLTypes'] = [{'CFBundleURLName': 'Petya chat messages', 'CFBundleURLSchemes': ['petya']}]
info['CFBundleIconFile'] = 'petya.icns'
with info_path.open('wb') as stream:
    plistlib.dump(info, stream)
# Sign with the selected persistent certificate, including nested helpers.
subprocess.run(['xattr', '-cr', str(output)], check=True)
# Notarization rejects any binary without the Developer ID, the hardened runtime and a timestamp, wherever it is
# (Electron's framework libraries, Squirrel's ShipIt, the app's own folder), and --deep does not reach them all:
# a release signs inside out — every binary, then the nested frameworks and helper apps, then the app.
if release:
    contents = output / 'Contents'
    depth = lambda path: len(path.parts)
    main_executable = contents / 'MacOS' / info.get('CFBundleExecutable', 'Electron')
    for file in sorted((f for f in contents.rglob('*') if f.is_file() and not f.is_symlink() and f != main_executable and macho(f)), key=depth, reverse=True):
        sign(file)
    for bundle in sorted((b for b in contents.rglob('*') if b.is_dir() and not b.is_symlink() and b.suffix in ('.framework', '.app')), key=depth, reverse=True):
        sign(bundle)
    sign(output)
else:
    sign(output, deep=True)
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
