"""Validate frozen references and historically disjoint held-out prompts."""
import hashlib,json,sys
from pathlib import Path
R=Path(__file__).resolve().parent
sys.path.insert(0,str(R.parent/'requirements-draft-v8'))
from scoring import score
read=lambda p:[json.loads(x) for x in p.read_text().splitlines()]
sig=lambda r:json.dumps(r['messages'][:-1],ensure_ascii=False,sort_keys=True)
p=json.loads((R/'protocol.json').read_text())
for name,h in p['hashes'].items():assert hashlib.sha256((R/name).read_bytes()).hexdigest()==h,name
train=read(R/'train.jsonl');acq=read(R/'acquisition.jsonl');fresh=read(R/'check.jsonl')+read(R/'fresh-drafts.jsonl');variants=read(R/'variants.jsonl')
assert (len(train),len(acq),len(fresh),len(variants))==(989,669,68,32)
assert len(set(map(sig,acq)))==669 and len(set(map(sig,fresh)))==68
by={}
for row in train+fresh:
 assert score(row,row['messages'][-1]['content'])=={'exactJSON':True,'schemaValid':True},row['id']
 turns=row['messages'][1:] if row['messages'][0]['role']=='system' else row['messages']
 assert all(x['role']==('user' if i%2==0 else 'assistant') for i,x in enumerate(turns)),row['id']
 if row.get('required_literals'):
  reference=json.loads(row['messages'][-1]['content'])['description']
  assert all(label in reference for label in row['required_literals']),row['id']
for row in train:
 k=sig(row);v=json.loads(row['messages'][-1]['content'])
 assert k not in by or by[k]==v,row['id']
 by[k]=v
assert set(map(sig,acq))<=set(by)
assert set(map(sig,fresh)).isdisjoint(by)
for file in R.parent.glob('requirements-draft-*/*.jsonl'):
 if file.parent==R:continue
 historical=[x for x in read(file) if 'messages' in x]
 assert set(map(sig,fresh)).isdisjoint(map(sig,historical)),file
assert p['steps']==len(train) and p['parent']=='../requirements-draft-v19/replay-adapter'
assert hashlib.sha256((R/p['parent']/'adapters.safetensors').read_bytes()).hexdigest()==p['parent_sha256']
print('Verified 989 presentations, all 669 familiar targets, 32 varied corrections and 68 historically disjoint held-out cases.')
