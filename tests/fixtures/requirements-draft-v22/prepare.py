"""Prepare v22 rehearsal from reviewed v21 failures; do not run training."""
import copy
import hashlib
import json
import sys
from pathlib import Path

R = Path(__file__).resolve().parent
P = R.parent / 'requirements-draft-v21'
sys.path.insert(0, str(R.parent / 'requirements-draft-v20'))
from evidence import reviewed_run

read = lambda p: [json.loads(s) for s in p.read_text().splitlines()]
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
sig = lambda r: json.dumps(r['messages'][:-1], ensure_ascii=False, sort_keys=True)
provenance = json.loads((P / 'results/repair4-holdout-provenance.json').read_text())
for name, expected in provenance['files'].items():
    assert sha(P / 'results' / name) == expected, name
adapter = P / 'repair4-adapter'
assert sha(adapter / 'adapters.safetensors') == provenance['adapter_sha256']
checks = reviewed_run(P / 'results/repair4-check.jsonl', P / 'check.jsonl', adapter)
drafts = reviewed_run(P / 'results/repair4-drafts.jsonl', P / 'fresh-drafts.jsonl',
                      adapter, P / 'results/repair4-drafts-review.json', True)
assert (checks['passed'], drafts['passed']) == (45, 9)
failures = checks['failures'] + drafts['failures']
assert len(failures) == 10
new = read(P / 'check.jsonl') + read(P / 'fresh-drafts.jsonl')
refs = {r['id']: r for r in new}
corrections = [copy.deepcopy(refs[key]) for key in failures]
acquisition = read(P / 'acquisition.jsonl') + new
train = read(P / 'repair4-train.jsonl') + new + corrections * 12
# Preserve historical files; repair only the next generation's two bad targets.
fixes = {'v19-repeat': ('257 секунду', '257 секунд'),
         'v20-repeat': ('293 секунду', '293 секунды')}
for row in acquisition + train:
    if row['id'] in fixes:
        old, replacement = fixes[row['id']]
        row['messages'][-1]['content'] = row['messages'][-1]['content'].replace(old, replacement)
assert (len(acquisition), len(train)) == (801, 1581)
assert len({r['id'] for r in acquisition}) == 801
assert len(set(map(sig, acquisition))) == 801
sys.path.insert(0, str(R.parent / 'requirements-draft-v8'))
from scoring import score
by_prompt = {}
for row in train:
    assert score(row, row['messages'][-1]['content']) == {'exactJSON': True, 'schemaValid': True}
    target = json.loads(row['messages'][-1]['content'])
    key = sig(row)
    assert key not in by_prompt or by_prompt[key] == target, row['id']
    by_prompt[key] = target
assert set(map(sig, acquisition)) <= set(by_prompt)
for name, rows in [('corrections.jsonl', corrections), ('acquisition.jsonl', acquisition), ('train.jsonl', train)]:
    (R / name).write_text(''.join(json.dumps(row, ensure_ascii=False) + '\n' for row in rows))
report = {'status': 'data_prepared_training_not_started',
          'parent': '../requirements-draft-v21/repair4-adapter',
          'parent_sha256': provenance['adapter_sha256'],
          'inspected_failure_ids': failures,
          'target_repairs': fixes,
          'presentations': 1581, 'familiar_cases': 801,
          'hashes': {n: sha(R / n) for n in ['corrections.jsonl', 'acquisition.jsonl', 'train.jsonl']},
          'pending': 'Freeze a new historically prompt-disjoint holdout, its parent baseline and training protocol before any training. The 64 inspected v21 cases are now familiar development evidence.',
          'limits': 'Repeated correction targets and full rehearsal do not establish generalization. No model or release qualification.'}
(R / 'preparation.json').write_text(json.dumps(report, indent=2) + '\n')
print('Prepared ten corrected cases, 801 familiar cases and 1581 presentations; training remains gated on a new holdout and protocol.')
