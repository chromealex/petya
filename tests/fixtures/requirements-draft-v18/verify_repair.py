"""Verify the preserved initial run and the separately frozen acquisition repair."""
import argparse
import hashlib
import json
import math
import subprocess
import sys
from pathlib import Path

R = Path(__file__).resolve().parent
sys.path.insert(0, str(R.parent / 'requirements-draft-v8'))
from scoring import score
from literal_check import assess


def read(path):
    return list(map(json.loads, path.read_text().splitlines()))


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


p = argparse.ArgumentParser()
p.add_argument('--stage', choices=['protocol', 'adapter', 'acquisition'], default='protocol')
a = p.parse_args()
subprocess.run([sys.executable, str(R / 'verify.py'), '--stage', 'adapter'], check=True)
protocol = json.loads((R / 'repair-protocol.json').read_text())
assert protocol['parent_sha256'] == digest(R / 'adapter/adapters.safetensors')
assert protocol['training_sha256'] == digest(R / 'repair-train.jsonl')
train = read(R / 'repair-train.jsonl')
refs = {x['id']: x for x in read(R / 'acquisition.jsonl')}
assert len(train) == protocol['steps'] == 681
by_prompt = {}
for row in train:
    key = json.dumps(row['messages'][:-1], ensure_ascii=False, sort_keys=True)
    value = json.loads(row['messages'][-1]['content'])
    assert key not in by_prompt or by_prompt[key] == value
    by_prompt[key] = value
for row in refs.values():
    assert json.dumps(row['messages'][:-1], ensure_ascii=False, sort_keys=True) in by_prompt
for dataset in ['check.jsonl', 'release-dialogues.jsonl']:
    assert all(json.dumps(row['messages'][:-1], ensure_ascii=False, sort_keys=True) not in by_prompt for row in read(R / dataset))
initial = read(R / 'results/initial-acquisition.jsonl')
review = json.loads((R / 'results/initial-acquisition-review.json').read_text())
assert len(initial) == len(refs) and {x['id'] for x in initial} == set(refs)
assert set(review) == {x['id'] for x in initial if not x['exactJSON']}
assert {k for k,v in review.items() if not v['passed']} == set(protocol['failed_acquisition_ids'])
for row in initial:
    result = score(refs[row['id']], row['answer'])
    assert result['exactJSON'] == row['exactJSON'] and result['schemaValid'] == row['schemaValid']
    if row['id'] in review:
        assert review[row['id']]['answer_sha256'] == hashlib.sha256(row['answer'].encode()).hexdigest()
print('Verified acquisition-only repair protocol, initial failures and fresh separation.')
if a.stage == 'protocol':
    sys.exit(0)
adapter = R / 'repaired-adapter'
metadata = json.loads((adapter / 'training.json').read_text())
for field in ['steps', 'layers', 'epochs', 'seed', 'learning_rate', 'parent_sha256', 'training_sha256']:
    assert metadata[field] == protocol[field], field
assert len(metadata['loss']) == metadata['steps'] and all(map(math.isfinite, metadata['loss']))
assert metadata['adapter_sha256'] == digest(adapter / 'adapters.safetensors')
print('Verified completed repair adapter provenance.')
if a.stage == 'adapter':
    sys.exit(0)
rows = read(R / 'results/repaired-acquisition.jsonl')
manifest = json.loads((R / 'results/repaired-acquisition.manifest.json').read_text())
assert manifest['data_sha256'] == digest(R / 'acquisition.jsonl')
assert manifest['adapter_sha256'] == metadata['adapter_sha256']
assert manifest['config_sha256'] == digest(adapter / 'adapter_config.json')
assert manifest['reference_in_prompt'] is False
assert manifest['temperature'] == 0 and manifest['thinking'] is False
assert len(rows) == len(refs) and {x['id'] for x in rows} == set(refs)
reviews = json.loads((R / 'results/repaired-acquisition-review.json').read_text())
assert set(reviews) == {x['id'] for x in rows if not x['exactJSON']}
for row in rows:
    result = score(refs[row['id']], row['answer'])
    assert result['schemaValid'] and result['exactJSON'] == row['exactJSON']
    literal = assess(refs[row['id']], row['answer'])
    assert literal is None or literal['passed']
    if not result['exactJSON']:
        entry = reviews[row['id']]
        assert row['task'] == 'draft' and entry['passed'] is True and entry['reason'].strip()
        assert entry['answer_sha256'] == hashlib.sha256(row['answer'].encode()).hexdigest()
print(f'Verified all {len(rows)} familiar targets; {sum(x["exactJSON"] for x in rows)} exact JSON matches. This is not a release decision.')
