"""Score semantic values after accepting a single Markdown JSON wrapper."""
import json
import sys
from pathlib import Path
ROOT=Path(__file__).parent
def read(p):return [json.loads(s) for s in p.read_text().splitlines()]
data=read(ROOT/'holdout.jsonl')
outputs={name:read(Path(sys.argv[1])/(name+'.jsonl')) for name in ['base','v1','v2']}
assert all(len(x)==len(data) for x in outputs.values())
rows=[]
for i,r in enumerate(data):
 row=dict(id=i,topic=r['topic'],task=r['task'])
 for name,values in outputs.items():
  assert values[i]['id']==i
  answer=values[i]['answer'];s=answer.strip()
  if s.startswith('```json') and s.endswith('```'):s=s[7:-3].strip()
  try:parsed=json.loads(s)
  except ValueError:parsed=None
  row[name]=dict(answer=answer)
  if r['task']!='draft':
   expected=json.loads(r['messages'][-1]['content']);row['expected']=expected
   row[name]['passed']=isinstance(parsed,dict) and set(parsed)==set(expected) and all(type(parsed[k]) is type(v) and parsed[k]==v for k,v in expected.items())
 rows.append(row)
scores={n:{t:sum(r[n]['passed'] for r in rows if r['task']==t) for t in ['bounds','membership']} for n in outputs}
print(scores)
Path(sys.argv[2]).write_text(json.dumps(dict(scores=scores,records=rows),ensure_ascii=False,indent=2)+'\n')
