"""DPO plus explicit SFT rehearsal; reference log probabilities are frozen."""
import argparse,hashlib,json,math,random
from pathlib import Path
import mlx.core as mx
import mlx.nn as nn
import mlx.optimizers as optim
from mlx.utils import tree_flatten
from mlx_lm import load
from mlx_lm.tuner.utils import linear_to_lora_layers
ROOT=Path(__file__).parent
p=argparse.ArgumentParser();p.add_argument('base');p.add_argument('parent',type=Path);p.add_argument('output',type=Path);a=p.parse_args()
a.output.mkdir(exist_ok=False)
model,tok=load(a.base);mx.random.seed(42);model.freeze()
config=json.loads((a.parent/'adapter_config.json').read_text());linear_to_lora_layers(model,1,config['lora_parameters']);model.eval()
parent=mx.load(str(a.parent/'adapters.safetensors'));model.load_weights(list(parent.items()),strict=False)
weights=dict(tree_flatten(model.trainable_parameters()));assert set(weights)==set(parent)
assert all(bool(mx.all(weights[k]==v).item()) for k,v in parent.items())
def encode(messages,answer):
 prefix=tok.apply_chat_template(messages,add_generation_prompt=True,enable_thinking=False)
 target=tok.encode(answer+'<|im_end|>',add_special_tokens=False)
 assert len(prefix)+len(target)<=512
 return mx.array([prefix+target]),len(prefix)
def logp(net,tokens,offset):
 loss=nn.losses.cross_entropy(net(tokens[:,:-1])[:,offset-1:,:].astype(mx.float32),tokens[:,offset:],reduction='none')
 return -mx.sum(loss)
pairs=[];reference=[]
for r in map(json.loads,(ROOT/'preferences.jsonl').read_text().splitlines()):
 c,co=encode(r['messages'],r['chosen']);d,do=encode(r['messages'],r['rejected'])
 rc=logp(model,c,co).item();rd=logp(model,d,do).item()
 pairs.append((c,co,d,do,rc-rd));reference.append(dict(id=r['id'],chosenLogp=rc,rejectedLogp=rd))
print('Frozen reference for',len(pairs),'pairs',flush=True)
retention=[encode(r['messages'][:-1],r['messages'][-1]['content']) for r in map(json.loads,(ROOT/'preference-retention.jsonl').read_text().splitlines())]
def loss_fn(net,c,co,d,do,reference_delta,t,to):
 cp=logp(net,c,co);dp=logp(net,d,do)
 margin=0.1*(cp-dp-reference_delta)
 return mx.logaddexp(mx.array(0.0),-margin) - 0.2*cp/(c.shape[1]-co) - 0.2*logp(net,t,to)/(t.shape[1]-to)
# At initialization the relative log-probability change is zero.
c,co,d,do,ref=pairs[0]
assert abs((logp(model,c,co)-logp(model,d,do)).item()-ref)<0.001
optimizer=optim.Adam(learning_rate=0.00002);gradient=nn.value_and_grad(model,loss_fn);rng=random.Random(42);history=[]
for epoch in range(3):
 order=list(range(len(pairs)));rng.shuffle(order)
 for i in order:
  c,co,d,do,ref=pairs[i];t,to=retention[rng.randrange(len(retention))]
  loss,grads=gradient(model,c,co,d,do,ref,t,to);optimizer.update(model,grads);mx.eval(model.trainable_parameters(),optimizer.state,loss)
  value=loss.item();assert math.isfinite(value);history.append(value)
  if len(history)%8==0:print('Step',len(history),'loss',round(sum(history[-8:])/8,5),flush=True)
weights=dict(tree_flatten(model.trainable_parameters()));assert all(bool(mx.all(mx.isfinite(v)).item()) for v in weights.values())
artifact=a.output/'adapters.safetensors';mx.save_safetensors(str(artifact),weights)
(a.output/'adapter_config.json').write_text(json.dumps(config,indent=2)+'\n')
(a.output/'reference.json').write_text(json.dumps(reference,indent=2)+'\n')
record=dict(steps=len(history),epochs=3,beta=0.1,chosenSFTWeight=0.2,retentionSFTWeight=0.2,learning_rate=0.00002,seed=42,optimizer_reset=True,parent_sha256=hashlib.sha256((a.parent/'adapters.safetensors').read_bytes()).hexdigest(),preferences_sha256=hashlib.sha256((ROOT/'preferences.jsonl').read_bytes()).hexdigest(),retention_sha256=hashlib.sha256((ROOT/'preference-retention.jsonl').read_bytes()).hexdigest(),adapter_sha256=hashlib.sha256(artifact.read_bytes()).hexdigest(),loss=history)
(a.output/'training.json').write_text(json.dumps(record,indent=2)+'\n')
