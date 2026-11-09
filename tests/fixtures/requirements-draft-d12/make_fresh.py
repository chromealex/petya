"""New training dialogues for D12 and later: the D2 generator (same families, training pools and phrasings) with a
different seed offset, so the combinations are new. Prompts already in the D2 training set or in any held-out set
(D2 generated, v22 checks and drafts, the 801 familiar cases) are dropped. Writes fresh-train.jsonl.
"""
import importlib.util, json
from pathlib import Path
R = Path(__file__).resolve().parent
F = R.parent
spec = importlib.util.spec_from_file_location('generate', F / 'requirements-draft-d2/generate.py')
g = importlib.util.module_from_spec(spec); spec.loader.exec_module(g)
sig = lambda r: json.dumps(r['messages'][:-1], ensure_ascii=False, sort_keys=True)
read = lambda p: [json.loads(s) for s in p.read_text().splitlines()]
OFFSET = 1000
seen = set()
for p in ['requirements-draft-d2/new-train.jsonl', 'requirements-draft-d2/holdout.jsonl', 'requirements-draft-v22/check.jsonl',
          'requirements-draft-v22/fresh-drafts.jsonl', 'requirements-draft-v22/acquisition.jsonl']:
    seen |= set(map(sig, read(F / p)))
rows = []
for r in g.build('train', 720, offset=OFFSET):
    if sig(r) in seen: continue
    seen.add(sig(r)); r = {**r, 'id': r['id'].replace('d2-train-', 'd12-fresh-'), 'source': 'd2-generator+offset1000'}; rows.append(r)
(R / 'fresh-train.jsonl').write_text(''.join(json.dumps(r, ensure_ascii=False) + '\n' for r in rows))
from collections import Counter
print('fresh-train.jsonl', len(rows), dict(Counter(r['family'] for r in rows)))
