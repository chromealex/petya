"""Freeze checkpoint selection using validation evidence only."""
import hashlib
import json
from pathlib import Path
ROOT=Path(__file__).parent
review=json.loads((ROOT/'validation-review.json').read_text())['models']
summary={}
for model in ['base','epoch-1','epoch-2','epoch-4']:
 report=json.loads((ROOT/'validation-results'/f'{model}-validation.json').read_text())
 assert len(review[model])==report['draftTotal']==6
 assert {r['id'] for r in report['records'] if r['task']=='draft'}==set(review[model])
 summary[model]=dict(bounds=report['boundsCorrect'],drafts=sum(r['passed'] for r in review[model].values()))
candidates=[m for m in summary if m!='base']
eligible=[m for m in candidates if summary[m]['bounds']>=summary['base']['bounds']]
if eligible:
 selected=max(eligible,key=lambda m:(summary[m]['drafts'],-int(m.split('-')[1])))
else:
 selected=max(candidates,key=lambda m:(summary[m]['bounds'],summary[m]['drafts'],-int(m.split('-')[1])))
result=dict(selected=selected,validationGatePassed=bool(eligible),summary=summary,
            testDataSHA256=hashlib.sha256((ROOT/'test.jsonl').read_bytes()).hexdigest(),
            protocolSHA256=hashlib.sha256((ROOT/'protocol.json').read_bytes()).hexdigest())
with (ROOT/'selection.json').open('x') as f:json.dump(result,f,indent=2);f.write('\n')
print(result)
