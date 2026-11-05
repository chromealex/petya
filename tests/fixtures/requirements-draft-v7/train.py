"""Controlled correction rehearsal with balanced correction rehearsal."""
import argparse,hashlib,json,math,random,time
from pathlib import Path
import mlx.core as mx
import mlx.nn as nn
import mlx.optimizers as optim
from mlx.utils import tree_flatten
from mlx_lm import load
from mlx_lm.tuner.utils import linear_to_lora_layers
p=argparse.ArgumentParser();p.add_argument('base');p.add_argument('data',type=Path);p.add_argument('output',type=Path);p.add_argument('--parent',type=Path,required=True);p.add_argument('--epochs',type=int,required=True);p.add_argument('--lr',type=float,default=0.00015);p.add_argument('--attention',action='store_true');p.add_argument('--layers',type=int,default=1);p.add_argument('--mlp',action='store_true');a=p.parse_args()
a.output.mkdir(exist_ok=False)
model,tok=load(a.base);mx.random.seed(42);model.freeze()
config=json.loads((a.parent/'adapter_config.json').read_text());params=dict(config['lora_parameters']);params['keys']=list(params['keys'])
if a.attention:params['keys']+=['self_attn.q_proj','self_attn.k_proj']
if a.mlp:params['keys']+=['mlp.gate_proj','mlp.up_proj']
params['keys']=list(dict.fromkeys(params['keys']))
linear_to_lora_layers(model,a.layers,params);model.eval()
if a.layers>2:
 for layer in model.layers[-a.layers:]:
  if hasattr(layer,'linear_attn'):layer.linear_attn.train()
started=time.monotonic()
parent=mx.load(str(a.parent/'adapters.safetensors'));model.load_weights(list(parent.items()),strict=False)
weights=dict(tree_flatten(model.trainable_parameters()))
assert all(k.endswith(('lora_a','lora_b')) for k in weights)
assert all(bool(mx.all(weights[k]==v).item()) for k,v in parent.items())
assert all(bool(mx.all(v==0).item()) for k,v in weights.items() if k not in parent and k.endswith('lora_b'))
rows=list(map(json.loads,a.data.read_text().splitlines()));seq=[]
for r in rows:
 m=r['messages'];prefix=tok.apply_chat_template(m[:-1],add_generation_prompt=True,enable_thinking=False)
 answer=tok.encode(m[-1]['content']+'<|im_end|>',add_special_tokens=False)
 assert answer[-1] in tok.eos_token_ids and len(prefix)+len(answer)<=512
 seq.append((mx.array([prefix+answer]),len(prefix)))
def loss_fn(net,tokens,offset):
 return nn.losses.cross_entropy(net(tokens[:,:-1])[:,offset-1:,:].astype(mx.float32),tokens[:,offset:],reduction='mean')
gradient=nn.value_and_grad(model,loss_fn);optimizer=optim.Adam(learning_rate=a.lr);rng=random.Random(42);history=[]
for epoch in range(a.epochs):
 order=list(range(len(seq)));rng.shuffle(order)
 for i in order:
  tokens,offset=seq[i];loss,grads=gradient(model,tokens,offset);optimizer.update(model,grads);mx.eval(model.trainable_parameters(),optimizer.state,loss)
  v=loss.item();assert math.isfinite(v);history.append(v)
  if len(history)%16==0:print('Step',len(history),'loss',round(sum(history[-16:])/16,5),flush=True)
weights=dict(tree_flatten(model.trainable_parameters()));assert all(bool(mx.all(mx.isfinite(v)).item()) for v in weights.values())
artifact=a.output/'adapters.safetensors';mx.save_safetensors(str(artifact),weights)
config['lora_parameters']=params;config['num_layers']=a.layers;(a.output/'adapter_config.json').write_text(json.dumps(config,indent=2)+'\n')
record=dict(attention_added=a.attention,layers=a.layers,mlp_expanded=a.mlp,seed=42,epochs=a.epochs,steps=len(history),learning_rate=a.lr,optimizer_reset=True,trainable_parameters=sum(v.size for v in weights.values()),parent_sha256=hashlib.sha256((a.parent/'adapters.safetensors').read_bytes()).hexdigest(),training_sha256=hashlib.sha256(a.data.read_bytes()).hexdigest(),adapter_sha256=hashlib.sha256(artifact.read_bytes()).hexdigest(),loss=history,elapsed_seconds=time.monotonic()-started,peak_memory_bytes=mx.get_peak_memory())
(a.output/'training.json').write_text(json.dumps(record,indent=2)+'\n')
