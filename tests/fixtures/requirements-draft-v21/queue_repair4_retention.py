"""Run the frozen familiar evaluation only after training and artifact checks."""
import argparse
import fcntl
import hashlib
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--validate-only', action='store_true')
a = p.parse_args()
plan = json.loads((HERE / 'repair4-retention-execution.json').read_text())

def validate():
    for name, expected in plan['source_hashes'].items():
        assert hashlib.sha256((ROOT / name).read_bytes()).hexdigest() == expected, name
    protocol = json.loads((HERE / 'repair4-protocol.json').read_text())
    for name in ('repair4-train.jsonl', 'acquisition.jsonl'):
        assert hashlib.sha256((HERE / name).read_bytes()).hexdigest() == protocol['hashes'][name], name
    assert len((HERE / 'acquisition.jsonl').read_text().splitlines()) == 737
    for name in plan['new_outputs']:
        assert not Path(name).exists(), 'Refusing existing output: ' + name

validate()
if a.validate_only:
    print('Frozen sources/data and unused output paths verified; no inference started.')
    raise SystemExit(0)
# Open the existing training lock; do not create a missing directory or restart training.
with Path(plan['training_lock']).open('r+') as lock:
    print('Waiting for the existing training lock before artifact checks.', flush=True)
    fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
    validate()
    for stage in plan['stages']:
        print('Starting:', stage['name'], flush=True)
        subprocess.run([sys.executable, *stage['arguments']], cwd=ROOT, check=True)
    print('Familiar evaluation captured. Semantic review and all-case gate still required; no holdout inference was run.', flush=True)
