"""Assemble verified existing runtime notices; no new license conclusions."""
import argparse
import hashlib
import json
from pathlib import Path
import runpy

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / 'tests/fixtures/petya-v1-runtime-dependencies'
OUTPUT = ROOT / 'src/model-runtime/THIRD_PARTY_NOTICES.txt'
sha = lambda data: hashlib.sha256(data).hexdigest()

def assemble():
    inventory = json.loads((EVIDENCE / 'inventory.json').read_text())
    collect = runpy.run_path(str(EVIDENCE / 'inventory.py'))['collect']
    actual, supplied = collect(ROOT / 'src/model-runtime/requirements.txt')
    assert actual == inventory, 'Installed runtime inventory differs from frozen evidence'
    assert supplied == (EVIDENCE / 'SUPPLIED_NOTICES.txt').read_bytes()
    assert sha(supplied) == inventory['noticesSha256']
    versions = {p['name']: p['version'] for p in inventory['packages']}
    supplemental = json.loads((EVIDENCE / 'upstream-notices.json').read_text())
    parts = [b'''Petya model runtime: supplied third-party notices

These texts cover the pinned installed Python distributions and supplemental
exact-version source notices recorded below. They do not establish complete
transitive native/Rust dependency coverage or wheel-to-source build provenance.
Final runtime redistribution and installer notice coverage remain to be verified.

''', supplied]
    for package in supplemental['sources']:
        assert versions[package['name']] == package['version']
        for item in package['files']:
            source = (EVIDENCE / item['saved_path']).resolve()
            assert source.is_relative_to((EVIDENCE / 'upstream-notices').resolve())
            data = source.read_bytes()
            assert sha(data) == item['sha256'] and len(data) == item['bytes']
            header = (f"\n===== Supplemental {package['name']} {package['version']}: {item['archive_member']} =====\n"
                      f"Source archive: {package['url']}\nArchive SHA-256: {package['sha256']}\n"
                      f"Notice SHA-256: {item['sha256']}\n\n").encode()
            parts.extend([header, data, b'\n'])
    return b''.join(parts)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    bundle = assemble()
    if args.check:
        assert OUTPUT.read_bytes() == bundle, 'Packaged runtime notices are stale'
    else:
        OUTPUT.write_bytes(bundle)
    print(json.dumps({'bytes': len(bundle), 'sha256': sha(bundle), 'checked': args.check,
                      'scope': 'Verified notice assembly only; native dependency completeness remains open.'}))
