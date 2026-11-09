"""Freeze complete rehearsal and balanced decision contrasts for v21."""
import copy
import hashlib
import json
import sys
from pathlib import Path
R=Path(__file__).resolve().parent
P=R.parent/'requirements-draft-v20'
read=lambda p:[json.loads(s) for s in p.read_text().splitlines()]
sig=lambda r:json.dumps(r['messages'][:-1],ensure_ascii=False,sort_keys=True)
digest=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
acquisition=copy.deepcopy(read(P/'acquisition.jsonl'))
for name in ['check.jsonl','fresh-drafts.jsonl']:
    for row in read(P/name):
        row['id']='v21-previous-'+row['id'];acquisition.append(row)
contrasts=read(R/'contrasts.jsonl')
rehearsal=read(P/'variants.jsonl')+read(R.parent/'requirements-draft-v19/semantic-variants.jsonl')
train=acquisition+contrasts*2+rehearsal
fresh=read(R/'check.jsonl')+read(R/'fresh-drafts.jsonl')
assert (len(acquisition),len(contrasts),len(rehearsal),len(train),len(fresh))==(737,208,64,1217,64)
assert len({r['id'] for r in acquisition})==737
assert len(set(map(sig,acquisition)))==737
assert len(set(map(sig,fresh)))==64
sys.path.insert(0,str(R.parent/'requirements-draft-v8'))
from scoring import score
by={}
for row in train+fresh:
    assert score(row,row['messages'][-1]['content'])=={'exactJSON':True,'schemaValid':True},row['id']
    turns=row['messages'][1:] if row['messages'][0]['role']=='system' else row['messages']
    assert all(m['role']==('user' if i%2==0 else 'assistant') for i,m in enumerate(turns)),row['id']
    if row.get('required_literals'):
        assert all(x in json.loads(row['messages'][-1]['content'])['description'] for x in row['required_literals'])
for row in train:
    key=sig(row);target=json.loads(row['messages'][-1]['content'])
    assert key not in by or by[key]==target,row['id']
    by[key]=target
assert set(map(sig,acquisition))<=set(by)
assert set(map(sig,fresh)).isdisjoint(by)
for file in R.parent.glob('requirements-draft-*/*.jsonl'):
    if file.parent==R:continue
    historical=[row for row in read(file) if 'messages' in row]
    assert set(map(sig,fresh)).isdisjoint(map(sig,historical)),file
for name,rows in [('acquisition.jsonl',acquisition),('train.jsonl',train)]:
    (R/name).write_text(''.join(json.dumps(row,ensure_ascii=False)+'\n' for row in rows))
protocol={'parent':'../requirements-draft-v20/repair-adapter','parent_sha256':digest(P/'repair-adapter/adapters.safetensors'),'training_file':'train.jsonl','steps':len(train),'layers':32,'epochs':1,'seed':42,'learning_rate':1e-6,
'recipe':'737 familiar cases once, 208 balanced contrasts twice, and 64 earlier varied semantic examples once. Unchanged rank-8 attention/MLP completion-only trainer, optimizer reset, max length 512.',
'gate':'Capture parent baselines on 64 fresh cases after data commit. Evaluate all 737 familiar cases after training. Require complete retention and committed selection before candidate fresh inference. Preserve every parent success and demonstrate improvement; live/runtime/package gates remain separate.',
'limits':'Authored synthetic non-blind study; exposure balance and language coverage change together. Exact prompt disjointness does not prove distributional independence.',
'hashes':{name:digest(R/name) for name in ['train.jsonl','acquisition.jsonl','contrasts.jsonl','fresh-drafts.jsonl','check.jsonl']}}
(R/'protocol.json').write_text(json.dumps(protocol,indent=2)+'\n')
print('Frozen 1217 presentations, 737 familiar cases and 64 historically prompt-disjoint held-out cases.')
