"""Validate frozen datasets, task prompts, reference schemas and prompt separation."""
import hashlib,json,sys
from pathlib import Path
R=Path(__file__).resolve().parent
sys.path.insert(0,str(R.parent/'requirements-draft-v8'))
from scoring import score
read=lambda p:list(map(json.loads,p.read_text().splitlines()))
sig=lambda x:json.dumps(x['messages'][:-1],sort_keys=True,ensure_ascii=False)
digest=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
protocol=json.loads((R/'protocol.json').read_text())
for name,expected in protocol['hashes'].items():assert digest(R/name)==expected,name
release_protocol=json.loads((R/'release-dialogues-protocol.json').read_text())
assert digest(R/'release-dialogues.jsonl')==release_protocol['data_sha256']
assert release_protocol['training_use'] is False
train=read(R/'train.jsonl');acq=read(R/'acquisition.jsonl');fresh=read(R/'check.jsonl')+read(R/'release-dialogues.jsonl')
assert (len(train),len(acq),len(fresh))==(913,569,100)
assert len(set(map(sig,acq)))==569 and len(set(map(sig,fresh)))==100
systems={task:next(x['messages'][0] for x in acq if x['task']==task) for task in ['draft','bounds']}
by={}
for row in train+fresh:
 assert score(row,row['messages'][-1]['content'])=={'exactJSON':True,'schemaValid':True}
 if row['task'] in systems:assert row['messages'][0]==systems[row['task']],row['id']
 turns=row['messages'][1:] if row['messages'][0]['role']=='system' else row['messages']
 assert all(m['role']==('user' if i%2==0 else 'assistant') for i,m in enumerate(turns))
for row in train:
 key=sig(row);value=json.loads(row['messages'][-1]['content'])
 assert key not in by or by[key]==value
 by[key]=value
assert all(sig(x) in by for x in acq)
assert set(map(sig,fresh)).isdisjoint(by)
for path in R.parent.glob('requirements-draft-*/*.jsonl'):
 if path.parent==R:continue
 historical=[x for x in read(path) if 'messages' in x]
 assert set(map(sig,fresh)).isdisjoint(map(sig,historical)),path
print('Verified frozen 913 presentations, 569 retained cases and 100 historically disjoint fresh cases.')
