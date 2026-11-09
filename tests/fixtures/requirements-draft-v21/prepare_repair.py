"""Freeze full rehearsal plus increased exposure to inspected retention failures."""
import collections
import hashlib
import json
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "requirements-draft-v20"))
from evidence import reviewed_run

R = Path(__file__).resolve().parent
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
read = lambda p: list(map(json.loads, p.read_text().splitlines()))
report = reviewed_run(R/'results/acquisition.jsonl', R/'acquisition.jsonl',
                      R/'adapter', R/'results/acquisition-review.json')
assert report['total'] == 737 and report['passed'] == 728
failures = report['failures']
assert len(failures) == 9
refs = {row['id']: row for row in read(R/'acquisition.jsonl')}
frozen = json.loads((R/'protocol.json').read_text())
for name, expected in frozen['hashes'].items():
    assert sha(R/name) == expected, 'Frozen data changed'
original = read(R/'train.jsonl')
rows = original + [refs[key] for _ in range(12) for key in failures]
assert len(rows) == 1325
prompt = lambda row: json.dumps(row['messages'][:-1], ensure_ascii=False, sort_keys=True)
targets = {}
for row in rows:
    key = prompt(row)
    assert key not in targets or targets[key] == row['messages'][-1]['content']
    targets[key] = row['messages'][-1]['content']
assert all(prompt(row) in targets for row in refs.values())
for name in ['fresh-drafts.jsonl', 'check.jsonl']:
    assert not set(map(prompt, read(R/name))) & set(targets)
path = R/'repair-train.jsonl'
path.write_text(''.join(json.dumps(row, ensure_ascii=False)+'\n' for row in rows))
counts = collections.Counter(map(prompt, rows))
protocol = {
    'parent': 'adapter', 'parent_sha256': sha(R/'adapter/adapters.safetensors'),
    'training_file': path.name, 'steps': 1325, 'layers': 32, 'epochs': 1,
    'seed': 42, 'learning_rate': 1e-6,
    'hashes': {name: sha(R/name) for name in [path.name, 'train.jsonl', 'acquisition.jsonl', 'fresh-drafts.jsonl', 'check.jsonl']},
    'inspected_failure_ids': failures,
    'exposures': {key: counts[prompt(refs[key])] for key in failures},
    'recipe': 'Unchanged 1217-presentation rehearsal plus 12 extra copies of each of nine inspected failure targets; no reference rewriting.',
    'gate': 'All 737 familiar cases must pass before committed selection and any candidate fresh inference. The original 64 independent cases remain untouched.',
    'limits': 'Synthetic non-blind repair. Additional training and exposure weights change together; no isolated causal claim or release qualification.'
}
(R/'repair-protocol.json').write_text(json.dumps(protocol, indent=2)+'\n')
print('Frozen 1325 presentations, complete rehearsal, consistent targets, no fresh-prompt overlap.')
