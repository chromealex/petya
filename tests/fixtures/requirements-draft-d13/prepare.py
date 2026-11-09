"""Freeze Petya Andromeda D13: continue D10 (the group's D) on the familiar cases once plus fresh dialogues 21–40 of the
two families D12 got worse on (code: «по тому же коду», invented lifetimes; quote: the quote-is-not-a-ban clause) and
21–30 of the other seven, at learning rate 5e-7. D11 trained only weak families and lost the rest; D12 trained all
evenly and lost codes; D13 weights the two weak families and keeps all the others in.
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
FAMILIES = ['code', 'quote']
KEEP = ['cancel-one', 'permission', 'two-recipients', 'add-field', 'exact-name', 'screen-only', 'open-recipient']
OFFSET = 20
PER_FAMILY = 20
PER_KEEP = 10
familiar = read(F / 'requirements-draft-v22/acquisition.jsonl')
new = read(D2 / 'new-train.jsonl')
fresh = read(F / 'requirements-draft-d12/fresh-train.jsonl')
holdout = read(D2 / 'holdout.jsonl')
v22 = read(F / 'requirements-draft-v22/check.jsonl') + read(F / 'requirements-draft-v22/fresh-drafts.jsonl')
assert len(familiar) == 801 and len(new) == 720 and len(holdout) == 54
pick = lambda f, n: [r for r in fresh if r['family'] == f][OFFSET:OFFSET + n]
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
    'part': 'D13', 'group': 'Andromeda', 'parent': '/Volumes/KINGSTON/petya-train/andromeda-d10/adapter', 'parent_sha256': 'a8cf4f8ae0cbb5548aa664229493479ca129d004ca640f06dee0398bdc46ff2b',
    'training_file': 'train.jsonl', 'steps': len(train), 'layers': 32, 'epochs': 1, 'seed': 42, 'learning_rate': 5e-7,
    'families': FAMILIES, 'per_family': PER_FAMILY, 'kept_families': KEEP, 'per_kept_family': PER_KEEP, 'offset': OFFSET,
    'hashes': {'train.jsonl': sha(R / 'train.jsonl'), '../requirements-draft-d12/fresh-train.jsonl': sha(F / 'requirements-draft-d12/fresh-train.jsonl'), '../requirements-draft-d2/holdout.jsonl': sha(D2 / 'holdout.jsonl')},
    'sources': d3['sources'],
    'recipe': 'Continue D10 on the 801 familiar cases once plus fresh dialogues 21–40 of code and quote and 21–30 of the other seven families (911 presentations) at lr 5e-7.',
    'gate': 'D13 replaces D10 only if it is not worse than D10 on any set (46/54, 28+8/42, 797/801).',
    'limits': 'Fresh dialogues share pools and phrasings with D2 training data; no evaluation prompt is trained.',
}
(R / 'protocol.json').write_text(json.dumps(protocol, indent=2, ensure_ascii=False) + '\n')
print('Frozen D13:', len(train), 'presentations')
