"""Create fact-contradiction preferences without systematic clause deletion."""
import json
from pathlib import Path
ROOT=Path(__file__).parent
rows={r['id']:r for r in map(json.loads,(ROOT/'train.jsonl').read_text().splitlines())}
pairs=[]
for row in rows.values():
 if row['task']!='draft':continue
 chosen=json.loads(row['messages'][-1]['content']);text=chosen['description'];changed=None
 # Each edit contradicts an explicit positive or negative target requirement.
 for before,after in [('не добавлять','обязательно добавлять'),('не показывать','обязательно показывать'),('не отправлять','обязательно отправлять'),('скрывать','показывать'),('скрыть','показать'),('не печатать','обязательно печатать'),('не выводить','обязательно выводить'),('не согласован','уже согласован'),('не выбран','уже выбран'),('не менять','обязательно менять'),('строго меньше','строго больше'),('строго больше','строго меньше'),('не больше','строго больше'),('не меньше','строго меньше'),('ровно','не больше'),('не включать','обязательно включать'),('не требуется','обязательно требуется'),('сохранить','удалить')]:
  if before in text:
   changed=text.replace(before,after,1);edit=dict(before=before,after=after);break
 if changed is None:continue
 rejected=dict(chosen,description=changed)
 pairs.append(dict(id=row['id'],messages=row['messages'][:-1],chosen=json.dumps(chosen,ensure_ascii=False,separators=(',',':')),rejected=json.dumps(rejected,ensure_ascii=False,separators=(',',':')),edit=edit,source='Synthetic single factual contradiction; no clauses deleted'))
(ROOT/'contrasts.jsonl').write_text(''.join(json.dumps(r,ensure_ascii=False)+'\n' for r in pairs))
print(len(pairs),'single-contradiction preference pairs')
