"""Verify protocol-relative resolution and rejection of changed training bytes."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile

R = Path(__file__).resolve().parent
verifier = R / 'verify_artifact.py'
artifact = R / 'repair4-adapter'
original = R / 'repair4-protocol.json'

def run(protocol, output):
    return subprocess.run([sys.executable, '-B', str(verifier), str(artifact),
                           '--protocol', str(protocol), '--output', str(output)],
                          text=True, capture_output=True)

with tempfile.TemporaryDirectory(prefix='petya-protocol-check-') as temporary:
    root = Path(temporary)
    original_result = root / 'original-result.json'
    completed = run(original, original_result)
    assert completed.returncode == 0, completed.stderr
    protocol = json.loads(original.read_text())
    protocol['parent'] = str((R / protocol['parent']).resolve())
    data = root / protocol['training_file']
    data.write_bytes((R / protocol['training_file']).read_bytes())
    relocated = root / 'protocol.json'
    relocated.write_text(json.dumps(protocol))
    relocated_result = root / 'relocated-result.json'
    completed = run(relocated, relocated_result)
    assert completed.returncode == 0, completed.stderr
    assert json.loads(original_result.read_text()) == json.loads(relocated_result.read_text())
    data.write_bytes(data.read_bytes() + b'\n')
    rejected_output = root / 'must-not-exist.json'
    rejected = run(relocated, rejected_output)
    assert rejected.returncode != 0, 'Changed protocol-local data was accepted'
    assert 'AssertionError' in rejected.stderr, rejected.stderr
    assert not rejected_output.exists()
print('PASS: existing artifact, relocated protocol, and changed local training data rejection')
