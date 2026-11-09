"""Freeze Petya Andromeda D11: continue D10 on the familiar cases once plus the last 20 dialogues (61–80) of each
correction family where D10 still errs (quote: invented summaries and additions; cancel-one: «назначение dock_slot»;
code: the next issue by a new code; two-recipients: «без пояснения» lost) and 10 dialogues (61–70) of each family D10
fixed (open-recipient, permission, screen-only, exact-name) so they are kept, at learning rate 5e-7.
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
FAMILIES = ['quote', 'cancel-one', 'code', 'two-recipients']
KEEP = ['open-recipient', 'permission', 'screen-only', 'exact-name']
OFFSET = 60
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
    'part': 'D11', 'group': 'Andromeda', 'parent': '/Users/aleksandrfeer/.petya-train/andromeda-d10/adapter', 'parent_sha256': 'a8cf4f8ae0cbb5548aa664229493479ca129d004ca640f06dee0398bdc46ff2b',
    'training_file': 'train.jsonl', 'steps': len(train), 'layers': 32, 'epochs': 1, 'seed': 42, 'learning_rate': 5e-7,
    'families': FAMILIES, 'per_family': PER_FAMILY, 'kept_families': KEEP, 'per_kept_family': PER_KEEP, 'offset': OFFSET,
    'hashes': {'train.jsonl': sha(R / 'train.jsonl'), '../requirements-draft-d2/new-train.jsonl': sha(D2 / 'new-train.jsonl'), '../requirements-draft-d2/holdout.jsonl': sha(D2 / 'holdout.jsonl')},
    'sources': d3['sources'],
    'recipe': 'Continue D10 on the 801 familiar cases once plus dialogues 61–80 of four weak D2 families and 61–70 of the four families D10 fixed (921 presentations) at lr 5e-7.',
    'gate': 'D11 replaces D10 only if it is not worse than D10 on any set (46/54, 28+8/42, 797/801).',
    'limits': 'The families were chosen from D10 errors on the generated held-out set, so that set is not blind to the choice (no held-out dialogue is trained).',
}
(R / 'protocol.json').write_text(json.dumps(protocol, indent=2, ensure_ascii=False) + '\n')
print('Frozen D11:', len(train), 'presentations')
