"""Freeze acquisition-only correction before any candidate fresh inference."""
import hashlib,json,sys
from pathlib import Path
R=Path(__file__).resolve().parent
sys.path.insert(0,str(R.parent/'requirements-draft-v8'))
from scoring import score
read=lambda p:list(map(json.loads,p.read_text().splitlines()))
digest=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
sig=lambda x:json.dumps(x['messages'][:-1],sort_keys=True,ensure_ascii=False)
summary=json.loads((R/'results/acquisition-summary.json').read_text())
corrections=read(R/'acquisition-corrections.jsonl')
assert [x['id'] for x in corrections]==summary['failed']
assert len(corrections)==3 and summary['semantic_passed']==566
rows=corrections*12+read(R/'semantic-variants.jsonl')+read(R.parent/'requirements-draft-v18/release-dialogues.jsonl')+read(R.parent/'requirements-draft-v12/numeric-rehearsal.jsonl')+read(R.parent/'requirements-draft-v15/negative-variants.jsonl')
assert len(rows)==196
original={sig(x):x['messages'][-1]['content'] for x in read(R/'train.jsonl')}
for row in rows:
 assert sig(row) in original
 assert json.loads(row['messages'][-1]['content'])==json.loads(original[sig(row)])
 assert score(row,row['messages'][-1]['content'])['exactJSON']
for name in ['check.jsonl','release-dialogues.jsonl']:
 assert set(map(sig,rows)).isdisjoint(map(sig,read(R/name)))
(R/'repair-train.jsonl').write_text(''.join(json.dumps(x,ensure_ascii=False)+'\n' for x in rows))
protocol=dict(parent='adapter',parent_sha256=digest(R/'adapter/adapters.safetensors'),training_sha256=digest(R/'repair-train.jsonl'),steps=len(rows),layers=32,epochs=1,seed=42,learning_rate=0.0000025,failed_ids=summary['failed'],recipe='Three observed acquisition failures twelve times, 32 existing semantic variants, 16 prior diverse dialogues, 64 numeric and 48 negative-sort rehearsal cases.',gate='All 569 acquisition cases must pass after ordinary reload before selection and fresh evaluation.',candidate_fresh_evaluation_started=False,source_hashes={name:digest(R/name) for name in ['acquisition-corrections.jsonl','results/acquisition.jsonl','results/acquisition-review.json','semantic-variants.jsonl','check.jsonl','release-dialogues.jsonl']})
(R/'repair-protocol.json').write_text(json.dumps(protocol,indent=2)+'\n')
print('Frozen 196 acquisition-only repair presentations; all already in training; fresh prompts disjoint.')
