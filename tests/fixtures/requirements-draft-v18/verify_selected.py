"""Verify the complete artifact chain and the selected candidate retention gate."""
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


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read(path):
    return list(map(json.loads, path.read_text().splitlines()))


p = argparse.ArgumentParser()
p.add_argument('--stage', choices=['protocol', 'adapter', 'acquisition', 'fresh'], default='protocol')
a = p.parse_args()
subprocess.run([sys.executable, str(R / 'verify_repair.py'), '--stage', 'adapter'], check=True)
protocol = json.loads((R / 'question-repair-protocol.json').read_text())
assert protocol['parent_sha256'] == digest(R / 'repaired-adapter/adapters.safetensors')
assert protocol['training_sha256'] == digest(R / 'question-repair-train.jsonl')
train = read(R / 'question-repair-train.jsonl')
assert len(train) == protocol['steps'] == 180
signature = lambda row: json.dumps(row['messages'][:-1], ensure_ascii=False, sort_keys=True)
assert len(set(signature(x) for x in read(R / 'acquisition.jsonl'))) == 469
for data in ['check.jsonl', 'release-dialogues.jsonl']:
    assert set(map(signature, read(R / data))).isdisjoint(map(signature, train))
for row in train:
    assert score(row, row['messages'][-1]['content'])['exactJSON']
print('Verified second acquisition-only correction protocol and fresh separation.')
if a.stage == 'protocol':
    sys.exit(0)
adapter = R / 'question-adapter'
metadata = json.loads((adapter / 'training.json').read_text())
for field in ['steps', 'layers', 'epochs', 'seed', 'learning_rate', 'parent_sha256', 'training_sha256']:
    assert metadata[field] == protocol[field], field
assert len(metadata['loss']) == 180 and all(map(math.isfinite, metadata['loss']))
assert metadata['adapter_sha256'] == digest(adapter / 'adapters.safetensors')
print('Verified completed second repair adapter provenance.')
if a.stage == 'adapter':
    sys.exit(0)
refs = {x['id']: x for x in read(R / 'acquisition.jsonl')}
rows = read(R / 'results/question-acquisition.jsonl')
reviews = json.loads((R / 'results/question-acquisition-review.json').read_text())
assert len(rows) == len(refs) and {x['id'] for x in rows} == set(refs)
assert set(reviews) == {x['id'] for x in rows if not x['exactJSON']}
manifest = json.loads((R / 'results/question-acquisition.manifest.json').read_text())
assert manifest['data_sha256'] == digest(R / 'acquisition.jsonl')
assert manifest['adapter_sha256'] == metadata['adapter_sha256']
assert manifest['config_sha256'] == digest(adapter / 'adapter_config.json')
assert manifest['reference_in_prompt'] is False and manifest['temperature'] == 0 and manifest['thinking'] is False
for row in rows:
    result = score(refs[row['id']], row['answer'])
    assert result['schemaValid'] and result['exactJSON'] == row['exactJSON']
    literal = assess(refs[row['id']], row['answer'])
    assert literal is None or literal['passed']
    if not result['exactJSON']:
        review = reviews[row['id']]
        assert row['task'] == 'draft' and review['passed'] is True and review['reason'].strip()
        assert review['answer_sha256'] == hashlib.sha256(row['answer'].encode()).hexdigest()
print('Verified all 469 familiar requirements after ordinary reload.')
if a.stage == 'acquisition':
    sys.exit(0)
selection = json.loads((R / 'selection.json').read_text())
assert selection['adapter_sha256'] == metadata['adapter_sha256'] and selection['acquisition_passed'] is True
for name, dataset in [('candidate-check', 'check.jsonl'), ('candidate-release', 'release-dialogues.jsonl')]:
    refs = {x['id']: x for x in read(R / dataset)}
    rows = read(R / 'results' / (name + '.jsonl'))
    assert len(rows) == len(refs) and {x['id'] for x in rows} == set(refs)
    manifest = json.loads((R / 'results' / (name + '.manifest.json')).read_text())
    assert manifest['data_sha256'] == digest(R / dataset)
    assert manifest['adapter_sha256'] == metadata['adapter_sha256']
    assert manifest['config_sha256'] == digest(adapter / 'adapter_config.json')
    assert manifest['reference_in_prompt'] is False and manifest['temperature'] == 0 and manifest['thinking'] is False
    for row in rows:
        result = score(refs[row['id']], row['answer'])
        assert result['schemaValid'] == row['schemaValid'] and result['exactJSON'] == row['exactJSON']
print('Verified fresh inference provenance and complete coverage; release readiness is not asserted.')
