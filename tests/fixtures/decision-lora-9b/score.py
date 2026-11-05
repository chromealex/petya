"""Exact field and record scores; no model-based grading."""
import argparse
import json
from pathlib import Path

ROOT = Path(__file__).parent

def read(path):
    return [json.loads(s) for s in path.read_text().splitlines()]

def grade(row, expected):
    text = row['answer'].strip()
    try:
        value = json.loads(text)
    except ValueError:
        value = None
    shape = isinstance(value,dict) and set(value) == set(expected)
    fields = {k: shape and type(value[k]) is type(v) and value[k] == v for k,v in expected.items()}
    unwrapped = text[7:-3].strip() if text.startswith('```json') and text.endswith('```') else text
    try:
        raw = json.loads(unwrapped)
    except ValueError:
        raw = None
    semantic = isinstance(raw,dict) and set(raw)==set(expected) and all(
        type(raw[k]) is type(v) and raw[k]==v for k,v in expected.items())
    return {'answer':row['answer'],'exact_without_fences':semantic,'schema':shape,'status':fields['status'],
            'bounds':all(fields[k] for k in fields if k!='status'),'exact':all(fields.values())}

def main():
    parser=argparse.ArgumentParser()
    for arg in ['ollama','base','adapter','output']:
        parser.add_argument(arg,type=Path)
    args=parser.parse_args()
    holdout=read(ROOT/'holdout.jsonl')
    results={}
    for name in ('ollama','base','adapter'):
        rows=read(getattr(args,name))
        assert len(rows)==len(holdout)
        for i,(x,r) in enumerate(zip(holdout,rows)):
            assert r['id']==i and x['topic']==r['topic']
            expected=json.loads(x['messages'][-1]['content'])
            record=results.setdefault(i,{'id':i,'topic':x['topic'],'expected':expected})
            record[name]=grade(r,expected)
    records=list(results.values())
    scores={m:{key:sum(r[m][key] for r in records) for key in ('schema','status','bounds','exact','exact_without_fences')}
            for m in ('ollama','base','adapter')}
    args.output.write_text(json.dumps({'scores':scores,'records':records},ensure_ascii=False,indent=2)+'\n')
    print(scores)

if __name__=='__main__':
    main()
