"""Check predeclared literal UI labels without accepting nearby identifiers."""
import argparse,json,re,sys,unicodedata
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'requirements-draft-v8'))
from scoring import parse_json

def missing_literals(description,required):
    text=unicodedata.normalize('NFC',description)
    return [label for label in required if not re.search(r'(?<![\w-])'+re.escape(unicodedata.normalize('NFC',label))+r'(?![\w-])',text)]

def assess(row,answer):
    if not row.get('required_literals'):return None
    try:
        value=parse_json(answer)
        description=value['description']
        if not isinstance(description,str):raise ValueError('Description must be a string')
    except (ValueError,KeyError,TypeError):return dict(passed=False,missing=row['required_literals'],reason='Invalid draft JSON or description')
    missing=missing_literals(description,row['required_literals'])
    return dict(passed=not missing,missing=missing)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('data',type=Path);p.add_argument('answers',type=Path);p.add_argument('output',type=Path);a=p.parse_args()
    refs={x['id']:x for x in map(json.loads,a.data.read_text().splitlines())}
    rows=list(map(json.loads,a.answers.read_text().splitlines()))
    assert len(rows)==len(refs) and {x['id'] for x in rows}==set(refs)
    result={x['id']:assess(refs[x['id']],x['answer']) for x in rows if refs[x['id']].get('required_literals')}
    a.output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print('Exact labels:',sum(x['passed'] for x in result.values()),'/',len(result))
