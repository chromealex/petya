"""Build synthetic complete-versus-omitted-clause preferences from training only."""
import json
from pathlib import Path
ROOT=Path(__file__).parent
unique={r['id']:r for r in map(json.loads,(ROOT/'train.jsonl').read_text().splitlines())}
pairs=[]
for row in unique.values():
 if row['task']!='draft':continue
 chosen=json.loads(row['messages'][-1]['content']);description=chosen['description']
 if '. ' not in description:continue
 kept,removed=description.rsplit('. ',1)
 rejected=dict(chosen,description=kept+'.')
 assert rejected!=chosen and removed.strip()
 pairs.append(dict(id=row['id'],messages=row['messages'][:-1],chosen=json.dumps(chosen,ensure_ascii=False,separators=(',',':')),rejected=json.dumps(rejected,ensure_ascii=False,separators=(',',':')),removedClause=removed,source='Synthetic deletion from reviewed supervised target; not human feedback'))
(ROOT/'preferences.jsonl').write_text(''.join(json.dumps(r,ensure_ascii=False)+'\n' for r in pairs))
retention=[r for r in unique.values() if r['task']=='bounds']
# The already-viewed development smoke cases are now explicitly rehearsal data.
retention += [r for r in map(json.loads,(ROOT/'test.jsonl').read_text().splitlines()) if r['task']=='general']*8
(ROOT/'preference-retention.jsonl').write_text(''.join(json.dumps(r,ensure_ascii=False)+'\n' for r in retention))
print(len(pairs),'synthetic omission preferences;',len(retention),'numeric/general rehearsal records')
