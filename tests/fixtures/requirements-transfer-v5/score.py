"""Score structured transfer and retain complete draft answers for review."""
import json
import re
import sys
from pathlib import Path
ROOT=Path(__file__).parent
reference={r['id']:r for r in map(json.loads,(ROOT/'test.jsonl').read_text().splitlines())}
answers=list(map(json.loads,Path(sys.argv[1]).read_text().splitlines()))
assert len(answers)==len(reference)==32 and {r['id'] for r in answers}==set(reference)
summary={g:dict(correct=0,total=0) for g in ['basic','extended']}
valid=0
for row in answers:
 ref=reference[row['id']];assert (row['task'],row['group'])==(ref['task'],ref['group'])
 try: parsed=json.loads(re.sub(r'^```(?:json)?\s*|\s*```$', '', row['answer'].strip()))
 except ValueError:parsed=None
 if row['task']=='bounds':
  expected=json.loads(ref['messages'][-1]['content'])
  row['expected']=expected
  row['passed']=isinstance(parsed,dict) and parsed.keys()==expected.keys() and all(type(parsed[k]) is type(v) and parsed[k]==v for k,v in expected.items())
  summary[row['group']]['total']+=1;summary[row['group']]['correct']+=row['passed']
 else:
  row['validJSON']=isinstance(parsed,dict) and set(parsed)=={'summary','description','questions'} and all(isinstance(parsed[k],str) for k in ['summary','description']) and isinstance(parsed['questions'],list) and all(isinstance(q,str) for q in parsed['questions'])
  valid+=row['validJSON']
pairs={}
for row in answers:
 if row['task']=='bounds':pairs.setdefault(reference[row['id']]['topic'],[]).append(row['passed'])
assert len(pairs)==12 and all(len(v)==2 for v in pairs.values())
result=dict(numeric=summary,pairsBothCorrect=sum(all(v) for v in pairs.values()),pairsTotal=12,validDrafts=valid,draftTotal=8,records=answers)
Path(sys.argv[2]).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print({k:v for k,v in result.items() if k!='records'})
