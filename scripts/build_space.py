"""Check staging and publication volumes before starting an expensive build."""
import pathlib
import shutil
import tempfile


def tree_size(path):
    return sum(p.stat().st_size for p in path.rglob('*') if p.is_file() and not p.is_symlink()) if path.exists() else 0


def check_build_space(root, platform):
    temp = pathlib.Path(tempfile.gettempdir())
    if platform == 'mac':
        size = sum(tree_size(root / p) for p in ('node_modules/electron/dist/Electron.app', 'assets', 'src', 'runtime/whisper-build/bin'))
        size += (root / 'runtime/models/ggml-base.bin').stat().st_size
        size = max(size, tree_size(root / 'Petya.app'))
    else:
        size = max(tree_size(root / 'Petya.app'), 1024 ** 3) * 3
    required = size + 512 * 1024 ** 2
    targets = [temp] if temp.stat().st_dev == root.stat().st_dev else [temp, root]
    for target in targets:
        free = shutil.disk_usage(target).free
        if free < required:
            raise SystemExit(f'Недостаточно места для сборки ({target}): требуется около {required / 1024**3:.1f} ГБ, свободно {free / 1024**3:.1f} ГБ. Освободите место и повторите сборку.')
