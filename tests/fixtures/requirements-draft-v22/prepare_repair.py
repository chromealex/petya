"""Freeze full rehearsal and additional exposure to five reviewed failures."""
import collections
import hashlib
import json
from pathlib import Path
import sys
R = Path(__file__).resolve().parent
sys.path.insert(0, str(R.parent/'requirements-draft-v20'))
from evidence import reviewed_run
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
read = lambda p: list(map(json.loads, p.read_text().splitlines()))
report = reviewed_run(R/'results/acquisition.jsonl', R/'acquisition.jsonl',
                      R/'adapter', R/'results/acquisition-review.json')
assert report['total'] == 801 and report['passed'] == 796
failures = report['failures']
assert len(failures) == 5
frozen = json.loads((R/'protocol.json').read_text())
for name, expected in frozen['hashes'].items():
    assert sha(R/name) == expected, name
refs = {row['id']: row for row in read(R/'acquisition.jsonl')}
original = read(R/'train.jsonl')
rows = original + [refs[key] for _ in range(12) for key in failures]
assert len(rows) == 1641
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
    'training_file': path.name, 'steps': len(rows), 'layers': 32, 'epochs': 1,
    'seed': 42, 'learning_rate': 1e-6,
    'hashes': {name: sha(R/name) for name in [path.name, 'train.jsonl', 'acquisition.jsonl', 'fresh-drafts.jsonl', 'check.jsonl', 'holdout-freeze.json']},
    'sources': frozen['sources'],
    'review_sha256': sha(R/'results/acquisition-review.json'),
    'inspected_failure_ids': failures,
    'exposures': {key: counts[prompt(refs[key])] for key in failures},
    'recipe': 'Unchanged 1581 presentations plus twelve extra copies of each of five reviewed failures. Existing corrected references, full rehearsal, no prompt changes. Reset Adam, stop at 16 and verify before resuming with Adam state.',
    'gate': frozen['gate'],
    'limits': frozen['limits']
}
(R/'repair-protocol.json').write_text(json.dumps(protocol, indent=2)+'\n')
print('Frozen 1641 presentations; full rehearsal, consistent targets, no holdout overlap.')
print(json.dumps(protocol['exposures']))
