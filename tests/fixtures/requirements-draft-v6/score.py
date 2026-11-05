"""Compute deterministic structured scores; preserve drafts for semantic review."""
import argparse
import json
import re
from pathlib import Path
ROOT=Path(__file__).parent
p=argparse.ArgumentParser();p.add_argument('split',choices=['test']);p.add_argument('input',type=Path);p.add_argument('output',type=Path);a=p.parse_args()
rows=[json.loads(s) for s in (ROOT/f'{a.split}.jsonl').read_text().splitlines()]
reference={r['id']:r for r in rows}
answers=[json.loads(s) for s in a.input.read_text().splitlines()]
assert len(answers)==len(reference) and {r['id'] for r in answers}==set(reference)
bounds=valid=0
for r in answers:
 try:v=json.loads(re.sub(r'^```(?:json)?\s*|\s*```$', '', r['answer'].strip()))
 except ValueError:v=None
 expected=json.loads(reference[r['id']]['messages'][-1]['content'])
 if r['task']=='bounds':
  r['passed']=isinstance(v,dict) and v.keys()==expected.keys() and all(type(v[k]) is type(x) and v[k]==x for k,x in expected.items())
  bounds+=r['passed']
 else:
  r['validJSON']=isinstance(v,dict) and set(v)=={'summary','description','questions'} and all(isinstance(v[k],str) for k in ['summary','description']) and isinstance(v['questions'],list) and all(isinstance(x,str) for x in v['questions'])
  valid+=r['validJSON']
result=dict(boundsCorrect=bounds,boundsTotal=sum(r['task']=='bounds' for r in rows),validDrafts=valid,draftTotal=sum(r['task']=='draft' for r in rows),records=answers)
a.output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print({k:v for k,v in result.items() if k!='records'})
