"""Freeze Petya Andromeda D8: continue D7 on the familiar cases once plus 20 dialogues of each correction family where
D7 lost D1 successes (code: «не для входа»; two-recipients: invented document names; cancel-one: «назначение» instead of
the field; permission and quote: wrong summaries), at learning rate 5e-7 — the recipe that worked for D7.
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
FAMILIES = ['code', 'two-recipients', 'cancel-one', 'permission', 'quote']
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
    'part': 'D8', 'group': 'Andromeda', 'parent': '/Users/aleksandrfeer/.petya-train/andromeda-d7/adapter', 'parent_sha256': '05b363874b5eead8ba33431559c192bd2fae589a0207a7094139d8571bd36b9e',
    'training_file': 'train.jsonl', 'steps': len(train), 'layers': 32, 'epochs': 1, 'seed': 42, 'learning_rate': 5e-7,
    'families': FAMILIES, 'per_family': PER_FAMILY,
    'hashes': {'train.jsonl': sha(R / 'train.jsonl'), '../requirements-draft-d2/new-train.jsonl': sha(D2 / 'new-train.jsonl'), '../requirements-draft-d2/holdout.jsonl': sha(D2 / 'holdout.jsonl')},
    'sources': d3['sources'],
    'recipe': 'Continue D7 on the 801 familiar cases once plus 20 D2 dialogues from each of five families (901 presentations) at lr 5e-7.',
    'gate': 'D8 replaces D7 only if it is not worse than D7 on any set (37/54, 28+6/42, 795/801) and wins back D1 successes D7 lost.',
    'limits': 'The families were chosen from D7 losses on the generated held-out set, so that set is not blind to the choice (no held-out dialogue is trained).',
}
(R / 'protocol.json').write_text(json.dumps(protocol, indent=2, ensure_ascii=False) + '\n')
print('Frozen D8:', len(train), 'presentations')
