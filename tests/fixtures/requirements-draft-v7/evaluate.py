"""Evaluate an explicit dataset after reloading a saved adapter."""
import argparse,json,re
from pathlib import Path
from mlx_lm import load,generate
from mlx_lm.sample_utils import make_sampler
p=argparse.ArgumentParser();p.add_argument('base');p.add_argument('data',type=Path);p.add_argument('output',type=Path);p.add_argument('--adapter');a=p.parse_args()
model,tok=load(a.base,adapter_path=a.adapter)
with a.output.open('x') as f:
 for row in map(json.loads,a.data.read_text().splitlines()):
  m=row['messages'];assert m[-2]['role']=='user'
  answer=generate(model,tok,prompt=tok.apply_chat_template(m[:-1],add_generation_prompt=True,enable_thinking=False),sampler=make_sampler(temp=0),max_tokens=450 if row['task']=='draft' else 120,verbose=False)
  try:parsed=json.loads(re.sub(r'^```(?:json)?\s*|\s*```$', '',answer.strip()))
  except ValueError:parsed=None
  try:expected=json.loads(m[-1]['content'])
  except ValueError:expected=m[-1]['content'];parsed=answer.strip()
  exact=type(parsed)==type(expected) and parsed==expected
  if row['task']=='bounds':exact=exact and all(type(parsed[k]) is type(v) for k,v in expected.items())
  r=dict(id=row['id'],task=row['task'],answer=answer,exactJSON=exact)
  f.write(json.dumps(r,ensure_ascii=False)+'\n');f.flush();print(row['id'],exact,flush=True)
