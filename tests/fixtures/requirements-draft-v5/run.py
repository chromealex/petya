"""Train fixed checkpoints and evaluate a caller-selected frozen split."""
import argparse
import hashlib
import importlib.util
import json
import math
import random
from pathlib import Path
import mlx.core as mx
import mlx.nn as nn
import mlx.optimizers as optim
from mlx.utils import tree_flatten
from mlx_lm import load, generate
from mlx_lm.sample_utils import make_sampler
from mlx_lm.tuner.utils import linear_to_lora_layers
ROOT=Path(__file__).parent
spec=importlib.util.spec_from_file_location('pilot',ROOT.parent/'decision-lora-9b/experiment.py')
pilot=importlib.util.module_from_spec(spec);spec.loader.exec_module(pilot)
p=argparse.ArgumentParser()
p.add_argument('action',choices=['train','evaluate']);p.add_argument('base');p.add_argument('output',type=Path)
p.add_argument('--adapter');p.add_argument('--split',choices=['validation','test'],default='validation')
a=p.parse_args()
model,tok=load(a.base,adapter_path=a.adapter)
assert model.model_type=='qwen3_5' and len(model.layers)==32

def read(name):return [json.loads(s) for s in (ROOT/f'{name}.jsonl').read_text().splitlines()]

if a.action=='evaluate':
 rows=read(a.split)
 if a.split=='test':
  old=ROOT.parent/'decision-lora-9b-v2/holdout.jsonl'
  rows += [dict(r,id=f'regression-{i}') for i,r in enumerate(json.loads(s) for s in old.read_text().splitlines()) if r['task']=='bounds']
 with a.output.open('x') as f:
  for row in rows:
   assert row['messages'][-2]['role']=='user'
   answer=generate(model,tok,prompt=pilot.prompt(tok,row['messages'][:-1]),sampler=make_sampler(temp=0),max_tokens=450 if row['task']=='draft' else 120,verbose=False)
   f.write(json.dumps(dict(id=row['id'],task=row['task'],answer=answer),ensure_ascii=False)+'\n');f.flush()
   print(row['id'],flush=True)
else:
 assert not a.adapter
 a.output.mkdir(exist_ok=False)
 mx.random.seed(42);model.freeze()
 params=dict(keys=['self_attn.v_proj','self_attn.o_proj','mlp.down_proj'],rank=8,scale=2.0,dropout=0.0)
 linear_to_lora_layers(model,1,params);model.eval()
 tensors=dict(tree_flatten(model.trainable_parameters()))
 assert len(tensors)==6 and all(k.endswith(('lora_a','lora_b')) for k in tensors)
 count=sum(v.size for v in tensors.values()); assert count==237568
 sequences=[]
 for row in read('train'):
  prefix=pilot.prompt(tok,row['messages'][:-1]);answer=tok.encode(row['messages'][-1]['content']+'<|im_end|>',add_special_tokens=False)
  assert answer[-1] in tok.eos_token_ids and len(prefix)+len(answer)<=512
  sequences.append((mx.array([prefix+answer]),len(prefix)))
 def loss_fn(net,tokens,offset):
  return nn.losses.cross_entropy(net(tokens[:,:-1])[:,offset-1:,:].astype(mx.float32),tokens[:,offset:],reduction='mean')
 gradient=nn.value_and_grad(model,loss_fn);optimizer=optim.Adam(learning_rate=0.00015)
 rng=random.Random(42);history=[]
 for epoch in range(1,5):
  order=list(range(len(sequences)));rng.shuffle(order)
  for i in order:
   tokens,offset=sequences[i];loss,grads=gradient(model,tokens,offset);optimizer.update(model,grads)
   mx.eval(model.trainable_parameters(),optimizer.state,loss)
   value=loss.item();assert math.isfinite(value);history.append(value)
   if len(history)%8==0:print('Step',len(history),'loss',round(sum(history[-8:])/8,5),flush=True)
  if epoch in [1,2,4]:
   destination=a.output/f'epoch-{epoch}';destination.mkdir()
   weights=dict(tree_flatten(model.trainable_parameters()))
   assert all(bool(mx.all(mx.isfinite(v)).item()) for v in weights.values())
   artifact=destination/'adapters.safetensors';mx.save_safetensors(str(artifact),weights)
   config=dict(fine_tune_type='lora',num_layers=1,lora_parameters=params,model=pilot.REPO,revision=pilot.REVISION)
   (destination/'adapter_config.json').write_text(json.dumps(config,indent=2)+'\n')
   record=dict(epoch=epoch,steps=len(history),seed=42,learning_rate=0.00015,trainable_parameters=count,training_sha256=hashlib.sha256((ROOT/'train.jsonl').read_bytes()).hexdigest(),adapter_sha256=hashlib.sha256(artifact.read_bytes()).hexdigest(),loss=history)
   (destination/'training.json').write_text(json.dumps(record,indent=2)+'\n')
   print('Saved',destination.name,flush=True)
