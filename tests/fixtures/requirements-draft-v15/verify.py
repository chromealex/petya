"""Verify frozen experiment provenance and the reported retention outcome."""
import ast, hashlib, json, math
from pathlib import Path
R = Path(__file__).parent

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def read(path):
    return list(map(json.loads, path.read_text().splitlines()))

for path in R.glob('*.py'):
    ast.parse(path.read_text())
for name, expected in json.loads((R / 'protocol.json').read_text())['hashes'].items():
    assert digest(R / name) == expected, name
metadata = json.loads((R / 'adapter/training.json').read_text())
assert metadata['steps'] == len(metadata['loss']) == 449
assert all(map(math.isfinite, metadata['loss']))
assert metadata['adapter_sha256'] == digest(R / 'adapter/adapters.safetensors')
assert metadata['parent_sha256'] == digest(R.parent / 'requirements-draft-v14/adapter/adapters.safetensors')
for name, data in [('acquisition', 'acquisition.jsonl'), ('candidate-check', 'check.jsonl')]:
    manifest = json.loads((R / 'results' / (name + '.manifest.json')).read_text())
    assert manifest['data_sha256'] == digest(R / data)
    assert manifest['adapter_sha256'] == metadata['adapter_sha256']
    assert manifest['config_sha256'] == digest(R / 'adapter/adapter_config.json')
    assert manifest['reference_in_prompt'] is False
    assert manifest['temperature'] == 0 and manifest['thinking'] is False
    rows = read(R / 'results' / (name + '.jsonl'))
    refs = read(R / data)
    assert len(rows) == len(refs)
    assert {x['id'] for x in rows} == {x['id'] for x in refs}
    if name == 'acquisition':
        assert len(rows) == 225
        assert all(x['exactJSON'] and x['schemaValid'] for x in rows)
by_prompt = {}
for row in read(R / 'train.jsonl'):
    key = json.dumps(row['messages'][:-1], sort_keys=True, ensure_ascii=False)
    value = json.loads(row['messages'][-1]['content'])
    if key in by_prompt:
        assert by_prompt[key] == value
    by_prompt[key] = value
fresh = {json.dumps(x['messages'][:-1], sort_keys=True, ensure_ascii=False) for x in read(R / 'check.jsonl')}
assert fresh.isdisjoint(by_prompt)
summary = json.loads((R / 'results/summary.json').read_text())
assert summary['fresh_passed'] == 67 and summary['paired_regressions'] == []
assert summary['release_petya_v1'] is False
remaining = read(R / 'remaining-corrections.jsonl')
assert len(remaining) == 1 and remaining[0]['id'] == 'report-1-01'
reviews = json.loads((R / 'results/manual-review.json').read_text())
assert reviews['candidate']['report-1-01'][0] is False
assert reviews['parent']['report-1-01'][0] is False
scores = json.loads((R / 'results/scores.json').read_text())['candidate']
assert scores['sorting'] == {'passed': 24, 'total': 24}
assert scores['bounds'] == {'passed': 20, 'total': 20}
assert scores['literal_labels'] == {'passed': 8, 'total': 8}
print('Verified 225 retained answers, frozen hashes, provenance, complete coverage, sorting 24/24 and no paired regressions; one known prohibition failure remains.')
