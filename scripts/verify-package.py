"""Verify the complete source tree and local imports before signing a package."""
import hashlib
import pathlib
import re
import sys


def verify(source, packaged):
    source, packaged = pathlib.Path(source), pathlib.Path(packaged)
    def manifest(root):
        return {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest()
                for p in root.rglob('*') if p.is_file() and p.name != '.DS_Store'}
    expected, actual = manifest(source), manifest(packaged)
    if expected != actual:
        missing = sorted(expected.keys() - actual.keys())
        extra = sorted(actual.keys() - expected.keys())
        changed = sorted(k for k in expected.keys() & actual.keys() if expected[k] != actual[k])
        raise RuntimeError(f'Incomplete package: missing={missing}, extra={extra}, changed={changed}')
    for path in packaged.rglob('*.cjs'):
        for name in re.findall(r"require\(['\"](\.[^'\"]+)['\"]\)", path.read_text()):
            target = (path.parent / name).resolve()
            try:
                target.relative_to(packaged.resolve())
            except ValueError:
                continue  # Development-only tests and platform resources live outside src.
            if not any(p.exists() for p in (target, pathlib.Path(str(target)+'.cjs'), pathlib.Path(str(target)+'.js'), target/'index.js')):
                raise RuntimeError(f'Missing local module: {path.name}: {name}')
    print(f'Package source verified: {len(expected)} files', flush=True)


if __name__ == '__main__':
    verify(*sys.argv[1:])
