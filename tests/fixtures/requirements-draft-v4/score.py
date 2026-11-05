"""Score exact boundary regressions and parse draft JSON, retaining raw output."""
import json
import re
import sys
from pathlib import Path
ROOT=Path(__file__).parent
out=Path(sys.argv[1])
previous=[json.loads(s) for s in (ROOT.parent/'decision-lora-9b-v2/holdout.jsonl').read_text().splitlines()]
report={}
for method in ['base','v1','v4']:
 records=[json.loads(s) for s in (out/f'{method}.jsonl').read_text().splitlines()]
 assert len(records)==26 and len({r['id'] for r in records})==26
 bounds=valid=0
 for row in records:
  try: parsed=json.loads(re.sub(r'^```(?:json)?\s*|\s*```$', '', row['answer'].strip()))
  except ValueError: parsed=None
  if row['task']=='bounds':
   expected=json.loads(previous[int(row['id'].split('-')[1])]['messages'][-1]['content'])
   passed=isinstance(parsed,dict) and parsed.keys()==expected.keys() and all(type(parsed[k]) is type(v) and parsed[k]==v for k,v in expected.items())
   row['passed']=passed;bounds+=passed
  else:
   passed=isinstance(parsed,dict) and set(parsed)=={'summary','description','questions'} and all(isinstance(parsed[k],str) for k in ['summary','description']) and isinstance(parsed['questions'],list) and all(isinstance(q,str) for q in parsed['questions'])
   row['validJSON']=passed;valid+=passed
 report[method]=dict(boundsCorrect=bounds,boundsTotal=18,validDrafts=valid,draftTotal=8,records=records)
(out/'results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print({k:{a:b for a,b in v.items() if a!='records'} for k,v in report.items()})
