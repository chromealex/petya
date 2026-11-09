"""Freeze Petya Andromeda D9: continue D8 on the familiar cases once plus 20 further dialogues of each correction family
where D8 still errs (screen-only: «Название интерфейса показывать», «База не трогать»; exact-name: the file name lost;
two-recipients: invented document names; quote: garbled additions), at learning rate 5e-7 — the D7/D8 recipe. The
dialogues are the next 20 of each family (21–40), not the ones D8 saw.
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
FAMILIES = ['screen-only', 'exact-name', 'two-recipients', 'quote']
OFFSET = 20
PER_FAMILY = 20
familiar = read(F / 'requirements-draft-v22/acquisition.jsonl')
new = read(D2 / 'new-train.jsonl')
holdout = read(D2 / 'holdout.jsonl')
v22 = read(F / 'requirements-draft-v22/check.jsonl') + read(F / 'requirements-draft-v22/fresh-drafts.jsonl')
assert len(familiar) == 801 and len(new) == 720 and len(holdout) == 54
chosen = [r for f in FAMILIES for r in [r for r in new if r['family'] == f][OFFSET:OFFSET + PER_FAMILY]]
assert len(chosen) == len(FAMILIES) * PER_FAMILY
train = familiar + chosen
for row in train:
    assert score(row, row['messages'][-1]['content']) == {'exactJSON': True, 'schemaValid': True}, row['id']
keys = set(map(sig, train))
assert not set(map(sig, holdout)) & keys and not set(map(sig, v22)) & keys, 'held-out prompt in training'
(R / 'train.jsonl').write_text(''.join(json.dumps(r, ensure_ascii=False) + '\n' for r in train))
d3 = json.loads((F / 'requirements-draft-d3/protocol.json').read_text())
protocol = {
    'part': 'D9', 'group': 'Andromeda', 'parent': '/Users/aleksandrfeer/.petya-train/andromeda-d8/adapter', 'parent_sha256': '9efdfdcf84d49d4c22f18127bb4b6458a3dd6d123dd24326809a0a83cd9b97fb',
    'training_file': 'train.jsonl', 'steps': len(train), 'layers': 32, 'epochs': 1, 'seed': 42, 'learning_rate': 5e-7,
    'families': FAMILIES, 'per_family': PER_FAMILY, 'offset': OFFSET,
    'hashes': {'train.jsonl': sha(R / 'train.jsonl'), '../requirements-draft-d2/new-train.jsonl': sha(D2 / 'new-train.jsonl'), '../requirements-draft-d2/holdout.jsonl': sha(D2 / 'holdout.jsonl')},
    'sources': d3['sources'],
    'recipe': 'Continue D8 on the 801 familiar cases once plus dialogues 21–40 of four D2 families (881 presentations) at lr 5e-7.',
    'gate': 'D9 replaces D8 only if it is not worse than D8 on any set (39/54, 28+7/42, 795/801).',
    'limits': 'The families were chosen from D8 errors on the generated held-out set, so that set is not blind to the choice (no held-out dialogue is trained).',
}
(R / 'protocol.json').write_text(json.dumps(protocol, indent=2, ensure_ascii=False) + '\n')
print('Frozen D9:', len(train), 'presentations')
