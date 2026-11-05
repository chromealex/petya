"""Evaluate the frozen transfer probes without updating any weights."""
import argparse
import hashlib
import json
from pathlib import Path
from mlx_lm import load,generate
from mlx_lm.sample_utils import make_sampler
ROOT=Path(__file__).parent
p=argparse.ArgumentParser();p.add_argument('base');p.add_argument('output',type=Path);p.add_argument('--adapter');a=p.parse_args()
manifest=json.loads((ROOT/'manifest.json').read_text())
assert hashlib.sha256((ROOT/'test.jsonl').read_bytes()).hexdigest()==manifest['testSHA256']
if a.adapter:
 assert hashlib.sha256((Path(a.adapter)/'adapters.safetensors').read_bytes()).hexdigest()==manifest['adapterSHA256']
model,tok=load(a.base,adapter_path=a.adapter)
assert model.model_type=='qwen3_5'
with a.output.open('x') as f:
 for s in (ROOT/'test.jsonl').read_text().splitlines():
  row=json.loads(s);messages=row['messages'][:-1]
  assert messages[-1]['role']=='user'
  prompt=tok.apply_chat_template(messages,add_generation_prompt=True,enable_thinking=False)
  answer=generate(model,tok,prompt=prompt,sampler=make_sampler(temp=0),max_tokens=450 if row['task']=='draft' else 120,verbose=False)
  f.write(json.dumps(dict(id=row['id'],task=row['task'],group=row['group'],answer=answer),ensure_ascii=False)+'\n');f.flush()
  print(row['id'],flush=True)
