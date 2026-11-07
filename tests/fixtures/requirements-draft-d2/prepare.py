"""Freeze Petya Andromeda D2: new generated correction dialogues plus one rehearsal of every familiar case.

Parent is D1 (requirements-draft-v21/repair4-adapter). The recipe of the earlier repairs is kept (rank 8, 32 layers,
lr 1e-6, one epoch, seed 42, checkpointed trainer) so that the data is the only change. Held-out: the 54 generated
dialogues with disjoint objects, names and part of the phrasings, and, as an independently authored check, the 42
frozen v22 cases on which D1 scored 27/30 checks and 6/12 drafts.
"""
import hashlib, json, sys
from pathlib import Path
R = Path(__file__).resolve().parent
F = R.parent
sys.path.insert(0, str(F / 'requirements-draft-v8'))
from scoring import score
read = lambda p: [json.loads(s) for s in p.read_text().splitlines()]
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
sig = lambda r: json.dumps(r['messages'][:-1], ensure_ascii=False, sort_keys=True)
familiar = read(F / 'requirements-draft-v22/acquisition.jsonl')
new = read(R / 'new-train.jsonl')
holdout = read(R / 'holdout.jsonl')
v22 = read(F / 'requirements-draft-v22/check.jsonl') + read(F / 'requirements-draft-v22/fresh-drafts.jsonl')
assert len(familiar) == 801 and len(new) == 720 and len(holdout) == 54 and len(v22) == 42
train = familiar + new
for row in train + holdout:
    assert score(row, row['messages'][-1]['content']) == {'exactJSON': True, 'schemaValid': True}, row['id']
seen = {}
for row in train:
    key = sig(row)
    assert key not in seen or seen[key] == row['messages'][-1]['content'], row['id']
    seen[key] = row['messages'][-1]['content']
assert not set(map(sig, holdout)) & set(seen), 'holdout prompt in training'
assert not set(map(sig, v22)) & set(seen), 'v22 holdout prompt in training'
# Objects, names and literals of the held-out dialogues never occur in the training dialogues.
sys.path.insert(0, str(R))
import generate
words = lambda pool: {w for item in pool for w in (item if isinstance(item, tuple) else (item,))}
text = '\n'.join(m['content'] for r in new for m in r['messages'])
for pool in ['DOCS', 'ROLES', 'IDS', 'LITERALS', 'QUOTES', 'GOODS', 'EVENTS']:
    for w in words(getattr(generate, pool)['hold']):
        if len(w) > 2 and pool not in ('DOCS', 'ROLES', 'GOODS', 'EVENTS') or len(w) > 6:
            assert w not in text, (pool, w)
(R / 'train.jsonl').write_text(''.join(json.dumps(r, ensure_ascii=False) + '\n' for r in train))
parent = F / 'requirements-draft-v21/repair4-adapter'
protocol = {
    'part': 'D2', 'group': 'Andromeda', 'parent': '../requirements-draft-v21/repair4-adapter', 'parent_sha256': sha(parent / 'adapters.safetensors'),
    'training_file': 'train.jsonl', 'steps': len(train), 'layers': 32, 'epochs': 1, 'seed': 42, 'learning_rate': 1e-6,
    'hashes': {n: sha(R / n) for n in ['train.jsonl', 'new-train.jsonl', 'holdout.jsonl', 'generate.py']},
    'sources': {'tests/fixtures/requirements-draft-v21/train_checkpointed.py': sha(F / 'requirements-draft-v21/train_checkpointed.py'),
                'tests/fixtures/requirements-draft-v21/checkpoint.py': sha(F / 'requirements-draft-v21/checkpoint.py')},
    'recipe': '801 familiar cases once plus 720 new generated correction dialogues (nine families, 80 each); continue from D1. Same trainer, rank, layers, learning rate and seed as the v21/v22 repairs.',
    'gate': 'D2 replaces D1 only if, on the same sets: the 54 generated held-out drafts improve with no D1 success lost, the 42 v22 cases are not worse than D1 (27/30, 6/12) with no D1 success lost, and familiar retention is not below D1. Every non-exact draft is reviewed against its dialogue. Live dialogue, runtime and packaging stay separate gates for stable.',
    'limits': 'Generated synthetic data; held-out pools and part of the phrasings are disjoint, but the families are the same. The v22 cases are the independent check.',
}
(R / 'protocol.json').write_text(json.dumps(protocol, indent=2, ensure_ascii=False) + '\n')
print('Frozen D2:', len(train), 'presentations;', len(holdout), 'generated held-out; v22 check', len(v22))
