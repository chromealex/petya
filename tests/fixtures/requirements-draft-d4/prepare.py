"""Freeze Petya Andromeda D4: the D3 data at half the learning rate.

D2 (familiar once) and D3 (familiar twice) both learned the new corrections (24 → 39 of 54) and both forgot familiar
cases (787 → 782, 783): repetition does not stop the forgetting. D4 keeps the D3 training file, parent D1, trainer,
rank, layers and seed, and halves the learning rate (1e-6 → 5e-7) so the stage moves D1 less.
"""
import hashlib, json
from pathlib import Path
R = Path(__file__).resolve().parent
F = R.parent
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
d3 = json.loads((F / 'requirements-draft-d3/protocol.json').read_text())
train = F / 'requirements-draft-d3/train.jsonl'
assert sha(train) == d3['hashes']['train.jsonl']
(R / 'train.jsonl').write_bytes(train.read_bytes())  # same blob as D3's in git
protocol = {
    'part': 'D4', 'group': 'Andromeda', 'parent': d3['parent'], 'parent_sha256': d3['parent_sha256'],
    'training_file': 'train.jsonl', 'steps': d3['steps'], 'layers': d3['layers'], 'epochs': 1, 'seed': 42,
    'learning_rate': 5e-7,
    'hashes': {'train.jsonl': sha(R / 'train.jsonl'), '../requirements-draft-d2/holdout.jsonl': d3['hashes']['../requirements-draft-d2/holdout.jsonl']},
    'sources': d3['sources'],
    'recipe': 'D3 data (801 familiar twice plus the 720 D2 dialogues, 2,322 presentations) from D1 at learning rate 5e-7 instead of 1e-6. Same trainer, rank, layers and seed.',
    'gate': 'D4 replaces D1 only if the 54 generated held-out drafts improve with no D1 success lost, the 42 v22 cases are not worse than D1 with no D1 success lost, and familiar retention is not below D1 (787/801). D1 results are those recorded in requirements-draft-d2/results.',
    'limits': 'Same data and held-out sets as D3; only the learning rate changes.',
}
(R / 'protocol.json').write_text(json.dumps(protocol, indent=2, ensure_ascii=False) + '\n')
print('Frozen D4:', protocol['steps'], 'presentations at', protocol['learning_rate'])
