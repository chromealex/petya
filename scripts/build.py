"""Publish one current application/installer per platform; keep no archived builds."""
from build_space import check_build_space
import argparse
import os
import pathlib
import shutil
import subprocess
import sys
import tempfile

root = pathlib.Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser()
parser.add_argument('--mac', action='store_true')
parser.add_argument('--win', action='store_true')
args = parser.parse_args()
platforms = ['mac', 'win'] if not (args.mac or args.win) else ([ 'mac' ] if args.mac else []) + ([ 'win' ] if args.win else [])
with (root / '.build.lock').open('w') as lock:
    # One build at a time; fcntl is POSIX-only, Windows (CI) locks with msvcrt.
    try:
        if sys.platform == 'win32':
            import msvcrt
            msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except (BlockingIOError, OSError):
        raise SystemExit('Another Petya build is running; wait for it to finish.')
    for platform in platforms:
        check_build_space(root, platform)
        if platform == 'mac':
            env = dict(os.environ, PETYA_MANAGED_BUILD='1')
            subprocess.run([sys.executable, str(root / 'scripts/local-mac.py')], cwd=root, env=env, check=True)
            verify_env = dict(os.environ, PETYA_VERIFY_BUILD='1')
            verify_env.pop('ELECTRON_RUN_AS_NODE', None)
            subprocess.run([str(root/'Petya.app/Contents/MacOS/Electron')], cwd=root, env=verify_env, check=True, timeout=90)
        else:
            node = 'node'
            node_env = dict(os.environ)
            if sys.platform == 'darwin':
                node = str(root/'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron')
                node_env['ELECTRON_RUN_AS_NODE'] = '1'
            with tempfile.TemporaryDirectory(prefix='petya-win-build-') as temp:
                output = pathlib.Path(temp)
                subprocess.run([node, '-e', "process.noAsar = true; delete process.versions.electron; require(process.argv[1])", str(root / 'node_modules/electron-builder/cli.js'), '--win', '--x64', '--publish', 'never',
                    '-c.directories.output=' + str(output), '-c.nsis.artifactName=Petya-Setup.exe'], cwd=root, env=node_env, check=True)
                extracted = output / 'verified-app'
                subprocess.run([node, '-e', "process.noAsar = true; require('@electron/asar').extractAll(process.argv[1],process.argv[2])",
                    str(output/'win-unpacked/resources/app.asar'), str(extracted)], cwd=root, env=node_env, check=True)
                subprocess.run([sys.executable, str(root/'scripts/verify-package.py'), str(root/'src'), str(extracted/'src')], check=True)
                # On Windows the unpacked app also has to start: same tray start check as the Mac build.
                if sys.platform == 'win32':
                    verify_env = dict(os.environ, PETYA_VERIFY_BUILD='1')
                    verify_env.pop('ELECTRON_RUN_AS_NODE', None)
                    verify_env['ELECTRON_ENABLE_LOGGING'] = '1'
                    run = subprocess.Popen([str(output/'win-unpacked/Petya.exe')], cwd=output/'win-unpacked', env=verify_env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
                    try:
                        log, _ = run.communicate(timeout=120)
                    except subprocess.TimeoutExpired:
                        run.kill(); log, _ = run.communicate()
                        print(log.decode('utf-8', 'replace')[-6000:], flush=True)
                        raise RuntimeError('Windows app did not finish the start check in 120 s')
                    print(log.decode('utf-8', 'replace')[-3000:], flush=True)
                    if run.returncode != 0:
                        raise RuntimeError('Windows app start check failed: exit ' + str(run.returncode))
                installer = output/'Petya-Setup.exe'
                if installer.stat().st_size < 1000000 or installer.read_bytes()[:2] != b'MZ':
                    raise RuntimeError('Windows installer is incomplete')
                shutil.copyfile(installer, root/'Petya-Setup.exe')
                print(root/'Petya-Setup.exe', flush=True)
    # Old build locations are never used for output again.
    for path in root.glob('Petya*.app'):
        if path.name != 'Petya.app': shutil.rmtree(path)
    for pattern in ('Petya*.exe', 'Petya*.zip', 'Petya*.dmg', 'Petya*.blockmap'):
        for path in root.glob(pattern):
            if path.name != 'Petya-Setup.exe': path.unlink()
    if (root/'dist').exists(): shutil.rmtree(root/'dist')
