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
assert metadata['steps'] == len(metadata['loss']) == 538
assert all(map(math.isfinite, metadata['loss']))
assert metadata['adapter_sha256'] == digest(R / 'adapter/adapters.safetensors')
assert metadata['parent_sha256'] == digest(R.parent / 'requirements-draft-v13/repaired-adapter/adapters.safetensors')
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
        assert len(rows) == 165
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
assert summary['fresh_passed'] == 58 and summary['paired_regressions'] == []
assert summary['release_petya_v1'] is False
parent = {x['id']: x['answer'] for x in read(R / 'results/parent-check.jsonl')}
remaining = read(R / 'remaining-corrections.jsonl')
assert len(remaining) == 2
# Formatting whitespace differs; the erroneous array values are unchanged.
assert all(json.loads(x['observed_answer']) == json.loads(parent[x['id']]) for x in remaining)
print('Verified 165 retained answers, frozen hashes, provenance, complete coverage, no paired regressions and two unchanged sorting failures.')
