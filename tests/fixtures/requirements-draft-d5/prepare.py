"""Freeze Petya Andromeda D5: the familiar cases once plus only the correction families D1 gets wrong, 20 dialogues each.

D2, D3 and D4 trained D1 on all 720 generated correction dialogues and all lost familiar cases (782, 783, 780 of 801),
whatever the rehearsal weight or the learning rate. D5 tests whether the amount of new data is the cause: of the nine
families only the six where D1 passed at most half of the generated held-out drafts are kept (screen-only 0/6,
open-recipient 1/6, code, permission and quote 2/6, exact-name 3/6), the first 20 training dialogues of each — 120
instead of 720. Recipe as D2: parent D1, rank 8, 32 layers, lr 1e-6, one epoch, seed 42.
"""
import hashlib, json, sys
from pathlib import Path
R = Path(__file__).resolve().parent
F = R.parent
D2 = F / 'requirements-draft-d2'
sys.path.insert(0, str(F / 'requirements-draft-v8'))
from scoring import score
read = lambda p: [json.loads(s) for s in p.read_text().splitlines()]
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
sig = lambda r: json.dumps(r['messages'][:-1], ensure_ascii=False, sort_keys=True)
FAMILIES = ['screen-only', 'open-recipient', 'code', 'permission', 'quote', 'exact-name']
PER_FAMILY = 20
familiar = read(F / 'requirements-draft-v22/acquisition.jsonl')
new = read(D2 / 'new-train.jsonl')
holdout = read(D2 / 'holdout.jsonl')
v22 = read(F / 'requirements-draft-v22/check.jsonl') + read(F / 'requirements-draft-v22/fresh-drafts.jsonl')
assert len(familiar) == 801 and len(new) == 720 and len(holdout) == 54
chosen = [r for f in FAMILIES for r in [r for r in new if r['family'] == f][:PER_FAMILY]]
assert len(chosen) == len(FAMILIES) * PER_FAMILY
train = familiar + chosen
for row in train:
    assert score(row, row['messages'][-1]['content']) == {'exactJSON': True, 'schemaValid': True}, row['id']
keys = set(map(sig, train))
assert not set(map(sig, holdout)) & keys and not set(map(sig, v22)) & keys, 'held-out prompt in training'
(R / 'train.jsonl').write_text(''.join(json.dumps(r, ensure_ascii=False) + '\n' for r in train))
d3 = json.loads((F / 'requirements-draft-d3/protocol.json').read_text())
protocol = {
    'part': 'D5', 'group': 'Andromeda', 'parent': d3['parent'], 'parent_sha256': d3['parent_sha256'],
    'training_file': 'train.jsonl', 'steps': len(train), 'layers': 32, 'epochs': 1, 'seed': 42, 'learning_rate': 1e-6,
    'families': FAMILIES, 'per_family': PER_FAMILY,
    'hashes': {'train.jsonl': sha(R / 'train.jsonl'), '../requirements-draft-d2/new-train.jsonl': sha(D2 / 'new-train.jsonl'), '../requirements-draft-d2/holdout.jsonl': sha(D2 / 'holdout.jsonl')},
    'sources': d3['sources'],
    'recipe': 'The 801 familiar cases once plus 20 D2 dialogues from each of the six families D1 gets wrong (921 presentations); continue from D1. Same trainer, rank, layers, learning rate and seed as D2.',
    'gate': 'D5 replaces D1 only if the 54 generated held-out drafts improve with no D1 success lost, the 42 v22 cases are not worse than D1 with no D1 success lost, and familiar retention is not below D1 (787/801). D1 results are those recorded in requirements-draft-d2/results.',
    'limits': 'The families were chosen from D1 results on the generated held-out set, so that set is not blind to the choice of families (no held-out dialogue is trained). The v22 cases and the familiar set are unaffected.',
}
(R / 'protocol.json').write_text(json.dumps(protocol, indent=2, ensure_ascii=False) + '\n')
print('Frozen D5:', len(train), 'presentations')
