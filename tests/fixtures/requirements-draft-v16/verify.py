"""Verify provenance, reviewed acquisition exception and paired regression."""
import ast,hashlib,json,math
from pathlib import Path
R=Path(__file__).parent

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def read(path):
    return list(map(json.loads,path.read_text().splitlines()))

for path in R.glob('*.py'):
    ast.parse(path.read_text())
for name,expected in json.loads((R/'protocol.json').read_text())['hashes'].items():
    assert digest(R/name)==expected,name
metadata=json.loads((R/'adapter/training.json').read_text())
assert metadata['steps']==len(metadata['loss'])==541
assert all(map(math.isfinite,metadata['loss']))
assert metadata['adapter_sha256']==digest(R/'adapter/adapters.safetensors')
assert metadata['parent_sha256']==digest(R.parent/'requirements-draft-v15/adapter/adapters.safetensors')
for name,data in [('acquisition','acquisition.jsonl'),('candidate-check','check.jsonl')]:
    manifest=json.loads((R/'results'/(name+'.manifest.json')).read_text())
    assert manifest['data_sha256']==digest(R/data)
    assert manifest['adapter_sha256']==metadata['adapter_sha256']
    assert manifest['config_sha256']==digest(R/'adapter/adapter_config.json')
    assert manifest['reference_in_prompt'] is False
    assert manifest['temperature']==0 and manifest['thinking'] is False
    rows=read(R/'results'/(name+'.jsonl'));refs={x['id']:x for x in read(R/data)}
    assert len(rows)==len(refs) and {x['id'] for x in rows}==set(refs)
    assert all(x['schemaValid'] for x in rows)
    if name=='acquisition':
        assert len(rows)==293
        different=[x for x in rows if not x['exactJSON']]
        assert len(different)==1 and different[0]['id']=='v16-failure-0-0'
        actual=json.loads(different[0]['answer']);expected=json.loads(refs[different[0]['id']]['messages'][-1]['content'])
        assert actual['description']==expected['description'] and actual['questions']==expected['questions']
        review=json.loads((R/'results/acquisition-review.json').read_text())[different[0]['id']]
        assert review['passed'] is True and actual['summary']==review['actual_summary'] and expected['summary']==review['expected_summary']
by_prompt={}
for row in read(R/'train.jsonl'):
    key=json.dumps(row['messages'][:-1],sort_keys=True,ensure_ascii=False)
    value=json.loads(row['messages'][-1]['content'])
    if key in by_prompt:assert by_prompt[key]==value
    by_prompt[key]=value
fresh={json.dumps(x['messages'][:-1],sort_keys=True,ensure_ascii=False) for x in read(R/'check.jsonl')}
assert fresh.isdisjoint(by_prompt)
summary=json.loads((R/'results/summary.json').read_text())
paired=json.loads((R/'results/paired-comparison.json').read_text())['candidate']
assert summary['fresh_passed']==72 and summary['release_petya_v1'] is False
assert paired['gains']==['sort-4-1-0'] and paired['regressions']==['polarity-0-00']
remaining=read(R/'remaining-corrections.jsonl')
assert {x['id'] for x in remaining}=={f'polarity-0-{bits}' for bits in ['00','10','01','11']}
scores=json.loads((R/'results/scores.json').read_text())['candidate']
assert scores['sorting']=={'passed':24,'total':24}
assert scores['bounds']=={'passed':20,'total':20}
assert scores['literal_labels']=={'passed':8,'total':8}
print('Verified 293 retained cases (292 exact), frozen data, provenance, full coverage, numeric/sort retention and explicit fresh regression.')
