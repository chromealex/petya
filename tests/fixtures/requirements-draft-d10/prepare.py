"""Freeze Petya Andromeda D10: continue D9 on the familiar cases once plus 20 dialogues (41–60) of each correction
family where D9 still errs (open-recipient: «в зал N», lost question; code: invented lifetimes; cancel-one; permission)
and 10 dialogues (41–50) of each family D9 learned (screen-only, exact-name, two-recipients, quote) so they are kept,
at learning rate 5e-7 — the D7–D9 recipe.
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
FAMILIES = ['open-recipient', 'code', 'cancel-one', 'permission']
KEEP = ['screen-only', 'exact-name', 'two-recipients', 'quote']
OFFSET = 40
PER_FAMILY = 20
PER_KEEP = 10
familiar = read(F / 'requirements-draft-v22/acquisition.jsonl')
new = read(D2 / 'new-train.jsonl')
holdout = read(D2 / 'holdout.jsonl')
v22 = read(F / 'requirements-draft-v22/check.jsonl') + read(F / 'requirements-draft-v22/fresh-drafts.jsonl')
assert len(familiar) == 801 and len(new) == 720 and len(holdout) == 54
pick = lambda f, n: [r for r in new if r['family'] == f][OFFSET:OFFSET + n]
chosen = [r for f in FAMILIES for r in pick(f, PER_FAMILY)] + [r for f in KEEP for r in pick(f, PER_KEEP)]
assert len(chosen) == len(FAMILIES) * PER_FAMILY + len(KEEP) * PER_KEEP
train = familiar + chosen
for row in train:
    assert score(row, row['messages'][-1]['content']) == {'exactJSON': True, 'schemaValid': True}, row['id']
keys = set(map(sig, train))
assert not set(map(sig, holdout)) & keys and not set(map(sig, v22)) & keys, 'held-out prompt in training'
(R / 'train.jsonl').write_text(''.join(json.dumps(r, ensure_ascii=False) + '\n' for r in train))
d3 = json.loads((F / 'requirements-draft-d3/protocol.json').read_text())
protocol = {
    'part': 'D10', 'group': 'Andromeda', 'parent': '/Users/aleksandrfeer/.petya-train/andromeda-d9/adapter', 'parent_sha256': '53e20e498ad1fc7147de2dd2b94c826c23794fa11af97b75ae1718cd19a889f2',
    'training_file': 'train.jsonl', 'steps': len(train), 'layers': 32, 'epochs': 1, 'seed': 42, 'learning_rate': 5e-7,
    'families': FAMILIES, 'per_family': PER_FAMILY, 'kept_families': KEEP, 'per_kept_family': PER_KEEP, 'offset': OFFSET,
    'hashes': {'train.jsonl': sha(R / 'train.jsonl'), '../requirements-draft-d2/new-train.jsonl': sha(D2 / 'new-train.jsonl'), '../requirements-draft-d2/holdout.jsonl': sha(D2 / 'holdout.jsonl')},
    'sources': d3['sources'],
    'recipe': 'Continue D9 on the 801 familiar cases once plus dialogues 41–60 of four weak D2 families and 41–50 of the four families D9 learned (921 presentations) at lr 5e-7.',
    'gate': 'D10 replaces D9 only if it is not worse than D9 on any set (39/54, 28+7/42, 796/801).',
    'limits': 'The families were chosen from D9 errors on the generated held-out set, so that set is not blind to the choice (no held-out dialogue is trained).',
}
(R / 'protocol.json').write_text(json.dumps(protocol, indent=2, ensure_ascii=False) + '\n')
print('Frozen D10:', len(train), 'presentations')
