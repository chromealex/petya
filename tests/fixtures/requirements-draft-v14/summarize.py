"""Aggregate fixed-case results using explicit non-blind semantic judgments."""
import argparse,hashlib,json
from literal_check import assess
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('results',type=Path);a=p.parse_args()
r=Path(__file__).parent
refs={x['id']:x for x in map(json.loads,(r/'check.jsonl').read_text().splitlines())}
reviews=json.loads((a.results/'manual-review.json').read_text())
summary={}
outcomes={}
for name,grades in reviews.items():
 rows=list(map(json.loads,(a.results/(name+'-check.jsonl')).read_text().splitlines()))
 assert len(rows)==len(refs) and {x['id'] for x in rows}==set(refs)
 assert set(grades)=={k for k,v in refs.items() if v['task']=='draft'}
 manifest=json.loads((a.results/(name+'-check.manifest.json')).read_text())
 assert manifest['data_sha256']==hashlib.sha256((r/'check.jsonl').read_bytes()).hexdigest()
 assert manifest['reference_in_prompt'] is False and manifest['thinking'] is False and manifest['temperature']==0
 stats={t:{'passed':sum(x['exactJSON'] for x in rows if x['task']==t),'total':sum(x['task']==t for x in rows)} for t in ['bounds','general']}
 literals={x['id']:assess(refs[x['id']],x['answer']) for x in rows}
 def passed(x):
  literal=literals[x['id']]
  return x['schemaValid'] and grades[x['id']][0] and (literal is None or literal['passed'])
 stats['literal_labels']={'passed':sum(v['passed'] for v in literals.values() if v is not None),'total':sum(v is not None for v in literals.values())}
 (a.results/(name+'-literals.json')).write_text(json.dumps({k:v for k,v in literals.items() if v is not None},ensure_ascii=False,indent=2)+'\n')
 stats['draft']={'passed':sum(passed(x) for x in rows if x['task']=='draft'),'total':len(grades)}
 for group,prefix in [('rename','name-'),('recipient_field','report-')]:
  part=[x for x in rows if x['id'].startswith(prefix)]
  stats[group]={'passed':sum(passed(x) for x in part),'total':len(part)}
 for group,condition in [('sorting',lambda x:x['id'].startswith('sort-')),('other_general',lambda x:x['task']=='general' and not x['id'].startswith('sort-'))]:
  part=[x for x in rows if condition(x)]
  stats[group]={'passed':sum(x['schemaValid'] and x['exactJSON'] for x in part),'total':len(part)}
 stats['schema']={'passed':sum(x['schemaValid'] for x in rows),'total':len(rows)}
 summary[name]=stats
 outcomes[name]={x["id"]:bool(passed(x) if x["task"]=="draft" else x["schemaValid"] and x["exactJSON"]) for x in rows}
(a.results/'scores.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps(summary,indent=2))

if 'parent' in outcomes:
 paired={name:{'gains':[k for k,v in cases.items() if v and not outcomes['parent'][k]],'regressions':[k for k,v in cases.items() if not v and outcomes['parent'][k]]} for name,cases in outcomes.items() if name!='parent'}
 (a.results/'paired-comparison.json').write_text(json.dumps(paired,indent=2)+'\n')
