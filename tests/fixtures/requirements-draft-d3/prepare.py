"""Freeze Petya Andromeda D3: the D2 data with the 801 familiar cases rehearsed twice.

D2 (one rehearsal) learned the new corrections (24 → 39 of 54) but forgot ten familiar cases (787 → 782). D3 keeps
the same 720 new dialogues and the same held-out sets and only doubles the familiar rehearsal; parent is D1 again and
the trainer, rank, layers, learning rate and seed stay the same.
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
familiar = read(F / 'requirements-draft-v22/acquisition.jsonl')
new = read(D2 / 'new-train.jsonl')
holdout = read(D2 / 'holdout.jsonl')
v22 = read(F / 'requirements-draft-v22/check.jsonl') + read(F / 'requirements-draft-v22/fresh-drafts.jsonl')
assert len(familiar) == 801 and len(new) == 720 and len(holdout) == 54
train = familiar + new + familiar
for row in train:
    assert score(row, row['messages'][-1]['content']) == {'exactJSON': True, 'schemaValid': True}, row['id']
keys = set(map(sig, train))
assert not set(map(sig, holdout)) & keys and not set(map(sig, v22)) & keys, 'held-out prompt in training'
(R / 'train.jsonl').write_text(''.join(json.dumps(r, ensure_ascii=False) + '\n' for r in train))
parent = F / 'requirements-draft-v21/repair4-adapter'
protocol = {
    'part': 'D3', 'group': 'Andromeda', 'parent': '../requirements-draft-v21/repair4-adapter', 'parent_sha256': sha(parent / 'adapters.safetensors'),
    'training_file': 'train.jsonl', 'steps': len(train), 'layers': 32, 'epochs': 1, 'seed': 42, 'learning_rate': 1e-6,
    'hashes': {'train.jsonl': sha(R / 'train.jsonl'), '../requirements-draft-d2/new-train.jsonl': sha(D2 / 'new-train.jsonl'), '../requirements-draft-d2/holdout.jsonl': sha(D2 / 'holdout.jsonl')},
    'sources': {'tests/fixtures/requirements-draft-v21/train_checkpointed.py': sha(F / 'requirements-draft-v21/train_checkpointed.py'),
                'tests/fixtures/requirements-draft-v21/checkpoint.py': sha(F / 'requirements-draft-v21/checkpoint.py')},
    'recipe': 'The 801 familiar cases twice plus the 720 D2 dialogues once (2,322 presentations); continue from D1. Same trainer, rank, layers, learning rate and seed.',
    'gate': 'D3 replaces D1 only if the 54 generated held-out drafts improve with no D1 success lost, the 42 v22 cases are not worse than D1 with no D1 success lost, and familiar retention is not below D1 (787/801). D1 results are those recorded in requirements-draft-d2/results.',
    'limits': 'Same data and held-out sets as D2; only the rehearsal weight changes.',
}
(R / 'protocol.json').write_text(json.dumps(protocol, indent=2, ensure_ascii=False) + '\n')
print('Frozen D3:', len(train), 'presentations')
