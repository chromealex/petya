"""Reload artifacts and evaluate reserved cases without reference completions."""
import argparse
import hashlib
import json
from pathlib import Path
from mlx_lm import load, generate
from mlx_lm.sample_utils import make_sampler
from scoring import score

p = argparse.ArgumentParser()
p.add_argument('base'); p.add_argument('data', type=Path); p.add_argument('output', type=Path)
p.add_argument('--adapter', type=Path)
a = p.parse_args()
assert not a.output.exists()
model, tok = load(a.base, adapter_path=str(a.adapter) if a.adapter else None)
manifest = dict(base=a.base, data_sha256=hashlib.sha256(a.data.read_bytes()).hexdigest(),
                adapter=str(a.adapter) if a.adapter else None, temperature=0,
                thinking=False, max_tokens={'draft': 450, 'other': 120}, reference_in_prompt=False)
if a.adapter:
    manifest['adapter_sha256'] = hashlib.sha256((a.adapter/'adapters.safetensors').read_bytes()).hexdigest()
    manifest['config_sha256'] = hashlib.sha256((a.adapter/'adapter_config.json').read_bytes()).hexdigest()
a.output.with_suffix('.manifest.json').write_text(json.dumps(manifest, indent=2)+'\n')
with a.output.open('x') as f:
    for row in map(json.loads, a.data.read_text().splitlines()):
        messages = row['messages']
        assert messages[-1]['role'] == 'assistant' and messages[-2]['role'] == 'user'
        answer = generate(model, tok,
                          prompt=tok.apply_chat_template(messages[:-1], add_generation_prompt=True, enable_thinking=False),
                          sampler=make_sampler(temp=0), max_tokens=450 if row['task']=='draft' else 120, verbose=False)
        result = dict(id=row['id'], task=row['task'], answer=answer, **score(row, answer))
        f.write(json.dumps(result, ensure_ascii=False)+'\n'); f.flush()
        print(row['id'], result['exactJSON'], result['schemaValid'], flush=True)
