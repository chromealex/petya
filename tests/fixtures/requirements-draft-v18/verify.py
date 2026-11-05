"""Verify completed experiment stages without mistaking partial work for release."""
import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

R = Path(__file__).resolve().parent
sys.path.insert(0, str(R.parent / 'requirements-draft-v8'))
from scoring import score
from literal_check import assess


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read(path):
    return [json.loads(line) for line in path.read_text().splitlines()]


def signature(row):
    return json.dumps(row['messages'][:-1], ensure_ascii=False, sort_keys=True)


def validate_dataset(rows):
    assert len({row['id'] for row in rows}) == len(rows)
    for row in rows:
        messages = row['messages']
        assert messages[-1]['role'] == 'assistant'
        history = messages[1:] if messages[0]['role'] == 'system' else messages
        assert all(m['role'] == ('user' if i % 2 == 0 else 'assistant') for i, m in enumerate(history))
        assert score(row, messages[-1]['content']) == {'exactJSON': True, 'schemaValid': True}


def validate_results(name, dataset, adapter=None):
    rows = read(R / 'results' / (name + '.jsonl'))
    refs = {x['id']: x for x in read(R / dataset)}
    assert len(rows) == len(refs) and {x['id'] for x in rows} == set(refs)
    manifest = json.loads((R / 'results' / (name + '.manifest.json')).read_text())
    assert manifest['data_sha256'] == digest(R / dataset)
    assert manifest['reference_in_prompt'] is False
    assert manifest['temperature'] == 0 and manifest['thinking'] is False
    if adapter:
        assert manifest['adapter_sha256'] == digest(adapter / 'adapters.safetensors')
        assert manifest['config_sha256'] == digest(adapter / 'adapter_config.json')
    else:
        assert manifest['adapter'] is None
    for row in rows:
        assert row['task'] == refs[row['id']]['task']
        recalculated = score(refs[row['id']], row['answer'])
        assert row['exactJSON'] == recalculated['exactJSON']
        assert row['schemaValid'] == recalculated['schemaValid']
    return rows, refs


p = argparse.ArgumentParser()
p.add_argument('--stage', choices=['data', 'adapter', 'acquisition', 'fresh'], default='data')
a = p.parse_args()
protocol = json.loads((R / 'protocol.json').read_text())
for filename, expected in protocol['hashes'].items():
    assert digest(R / filename) == expected, filename
train = read(R / 'train.jsonl')
acq = read(R / 'acquisition.jsonl')
fresh = read(R / 'check.jsonl')
release = read(R / 'release-dialogues.jsonl')
assert (len(train), len(acq), len(fresh), len(release)) == (801, 469, 84, 16)
for rows in [acq, fresh, release, read(R / 'replacement-variants.jsonl')]:
    validate_dataset(rows)
by_prompt = {}
for row in train:
    key = signature(row)
    expected = json.loads(row['messages'][-1]['content'])
    assert key not in by_prompt or by_prompt[key] == expected
    by_prompt[key] = expected
assert all(signature(row) in by_prompt for row in acq)
assert set(map(signature, fresh + release)).isdisjoint(by_prompt)
assert len(set(map(signature, fresh + release))) == 100
release_protocol = json.loads((R / 'release-dialogues-protocol.json').read_text())
assert release_protocol['data_sha256'] == digest(R / 'release-dialogues.jsonl')
assert release_protocol['training_use'] is False
for name, adapter in [('base', None), ('parent', R.parent / 'requirements-draft-v17/adapter'), ('historical', R.parent / 'requirements-draft-v8/adapter')]:
    validate_results(name + '-check', 'check.jsonl', adapter)
print('Verified frozen data, disjoint fresh cases and baseline provenance.')
if a.stage == 'data':
    sys.exit(0)
metadata = json.loads((R / 'adapter/training.json').read_text())
for field in ['steps', 'layers', 'epochs', 'seed', 'learning_rate']:
    assert metadata[field] == protocol[field], field
assert len(metadata['loss']) == metadata['steps']
assert all(math.isfinite(x) for x in metadata['loss'])
assert metadata['parent_sha256'] == digest(R.parent / 'requirements-draft-v17/adapter/adapters.safetensors')
assert metadata['training_sha256'] == digest(R / 'train.jsonl')
assert metadata['adapter_sha256'] == digest(R / 'adapter/adapters.safetensors')
print('Verified completed adapter provenance and finite training losses.')
if a.stage == 'adapter':
    sys.exit(0)
rows, refs = validate_results('acquisition', 'acquisition.jsonl', R / 'adapter')
reviews = json.loads((R / 'results/acquisition-review.json').read_text())
different = {x['id'] for x in rows if not x['exactJSON']}
assert set(reviews) == different
for row in rows:
    assert row['schemaValid']
    literal = assess(refs[row['id']], row['answer'])
    assert literal is None or literal['passed']
    if not row['exactJSON']:
        review = reviews[row['id']]
        assert review['passed'] is True and review['reason'].strip()
        assert review['answer_sha256'] == hashlib.sha256(row['answer'].encode()).hexdigest()
        assert row['task'] == 'draft', 'Numeric/general retention requires exact answers'
print(f'Verified retention of {len(rows)} familiar cases ({len(rows)-len(different)} exact).')
if a.stage == 'acquisition':
    sys.exit(0)
selection = json.loads((R / 'selection.json').read_text())
assert selection['adapter_sha256'] == metadata['adapter_sha256']
assert selection['acquisition_passed'] is True
validate_results('candidate-check', 'check.jsonl', R / 'adapter')
scores = json.loads((R / 'results/scores.json').read_text())['candidate']
paired = json.loads((R / 'results/paired-comparison.json').read_text())['candidate']
print(json.dumps({'candidate_scores': scores, 'paired': paired}, indent=2))
print('Fresh evidence verified. This command does not authorize or prove release.')
