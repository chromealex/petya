"""Recompute evidence against frozen data and actual model artifacts."""
import argparse,hashlib,json,sys
from pathlib import Path
R=Path(__file__).resolve().parent
sys.path.insert(0,str(R.parent/'requirements-draft-v19'))
from verify_results import verify_run
from literal_check import assess

def reviewed_run(output,dataset,adapter,review_path=None,all_drafts=False):
    rows,refs=verify_run(output,dataset,adapter)
    reviews=json.loads(review_path.read_text()) if review_path else {}
    required={x['id'] for x in rows if x['task']=='draft' and (all_drafts or not x['exactJSON'])}
    assert set(reviews)==required,'Incomplete semantic review coverage'
    decisions={};literals={}
    for row in rows:
        review=reviews.get(row['id'])
        if review:
            assert type(review['passed']) is bool and isinstance(review['reason'],str) and review['reason'].strip()
            assert review['answer_sha256']==hashlib.sha256(row['answer'].encode()).hexdigest(),'Reviewed answer changed'
        literal=assess(refs[row['id']],row['answer'])
        if literal is not None:literals[row['id']]=literal
        decisions[row['id']]=bool(row['schemaValid'] and (review['passed'] if review else row['exactJSON']) and (literal is None or literal['passed']))
    return {'total':len(rows),'exact':sum(x['exactJSON'] for x in rows),'passed':sum(decisions.values()),
            'failures':[key for key,value in decisions.items() if not value],'decisions':decisions,'literal_checks':literals}

def baseline(results):
    provenance=json.loads((results/'baseline-provenance.json').read_text())
    for name,expected in provenance['files'].items():assert hashlib.sha256((results/name).read_bytes()).hexdigest()==expected,'Frozen evidence changed'
    protocol=json.loads((R/'protocol.json').read_text());adapter=(R/protocol['parent']).resolve()
    assert hashlib.sha256((adapter/'adapters.safetensors').read_bytes()).hexdigest()==protocol['parent_sha256']
    for name,expected in protocol['hashes'].items():assert hashlib.sha256((R/name).read_bytes()).hexdigest()==expected
    return {'check':reviewed_run(results/'parent-check.jsonl',R/'check.jsonl',adapter),
            'drafts':reviewed_run(results/'parent-drafts.jsonl',R/'fresh-drafts.jsonl',adapter,results/'parent-drafts-review.json',True)}

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--results',type=Path,default=R/'results');a=parser.parse_args()
    print(json.dumps(baseline(a.results),ensure_ascii=False,indent=2))
