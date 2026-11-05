"""Reuse the original LoRA trainer with a new dataset; compare persisted adapters."""
import importlib.util
import json
import sys
from pathlib import Path
ROOT=Path(__file__).parent
spec=importlib.util.spec_from_file_location('pilot',ROOT.parent/'decision-lora-9b/experiment.py')
pilot=importlib.util.module_from_spec(spec);spec.loader.exec_module(pilot);pilot.ROOT=ROOT
from mlx_lm import load,generate
from mlx_lm.sample_utils import make_sampler
base=sys.argv[2];output=Path(sys.argv[3])
model,tok=load(base,adapter_path=sys.argv[4] if len(sys.argv)>4 else None)
if sys.argv[1]=='train':
 pilot.train(model,tok,output)
else:
 with output.open('x') as f:
  for i,row in enumerate(pilot.read('holdout.jsonl')):
   messages=row['messages'] if row['task']=='draft' else row['messages'][:-1]
   answer=generate(model,tok,prompt=pilot.prompt(tok,messages),sampler=make_sampler(temp=0),max_tokens=450 if row['task']=='draft' else 120,verbose=False)
   f.write(json.dumps(dict(id=i,topic=row['topic'],task=row['task'],answer=answer),ensure_ascii=False)+'\n');f.flush()
