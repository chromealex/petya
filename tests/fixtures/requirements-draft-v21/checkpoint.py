"""Atomic, hash-checked checkpoints for deterministic zero-dropout rehearsal."""
import hashlib,json,math,os,re
from pathlib import Path
import mlx.core as mx
from mlx.utils import tree_flatten,tree_unflatten

def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def unchanged_random(initial):
 current=list(mx.random.state)
 assert len(current)==len(initial) and all(bool(mx.array_equal(a,b).item()) for a,b in zip(current,initial)), 'Random state changed: stochastic resume is not supported'
def write(directory,model,optimizer,run,history,random_state,elapsed,peak):
 directory=Path(directory);directory.mkdir(parents=True,exist_ok=True)
 unchanged_random(random_state)
 arrays={'weights.'+k:v for k,v in tree_flatten(model.trainable_parameters())}
 arrays.update({'optimizer.'+k:v for k,v in tree_flatten(optimizer.state)})
 arrays.update({'random.'+str(i):v for i,v in enumerate(random_state)})
 mx.eval(arrays)
 assert all(bool(mx.all(mx.isfinite(v)).item()) for v in arrays.values())
 assert int(optimizer.step.item())==len(history)
 metadata={'run':run,'loss':history,'elapsed_seconds':elapsed,'peak_memory_bytes':peak}
 name='step-%08d.safetensors'%len(history);temporary=directory/(name+'.pending.safetensors');target=directory/name
 mx.save_safetensors(str(temporary),arrays,metadata={'checkpoint':json.dumps(metadata,allow_nan=False)})
 with temporary.open('rb') as stream:os.fsync(stream.fileno())
 os.replace(temporary,target)
 pointer=directory/'latest.json';previous=json.loads(pointer.read_text())['file'] if pointer.exists() else None
 index={'file':name,'sha256':sha(target),'previous':previous}
 pending=directory/'latest.pending.json'
 with pending.open('w') as stream:json.dump(index,stream);stream.flush();os.fsync(stream.fileno())
 os.replace(pending,pointer)
 fd=os.open(directory,os.O_RDONLY)
 try:os.fsync(fd)
 finally:os.close(fd)
 for old in directory.glob('step-*.safetensors'):
  if re.fullmatch(r'step-\d{8}\.safetensors',old.name) and old.name not in {name,previous}:old.unlink()
 return index

def restore(directory,model,optimizer,run,random_state):
 directory=Path(directory);index=json.loads((directory/'latest.json').read_text())
 assert re.fullmatch(r'step-\d{8}\.safetensors',index['file'])
 source=directory/index['file'];assert sha(source)==index['sha256'],'Checkpoint bytes changed'
 arrays,metadata=mx.load(str(source),return_metadata=True);state=json.loads(metadata['checkpoint'])
 assert state['run']==run,'Training identity changed'
 history=state['loss'];assert 0<=len(history)<=len(run['order']) and all(map(math.isfinite,history))
 assert index['file']=='step-%08d.safetensors'%len(history)
 optimizer.init(model.trainable_parameters())
 expected={'weights.'+k:v for k,v in tree_flatten(model.trainable_parameters())}
 expected.update({'optimizer.'+k:v for k,v in tree_flatten(optimizer.state)})
 expected.update({'random.'+str(i):v for i,v in enumerate(random_state)})
 assert arrays.keys()==expected.keys(),'Checkpoint tensor coverage changed'
 for key,value in arrays.items():
  assert value.shape==expected[key].shape and value.dtype==expected[key].dtype,key
  assert bool(mx.all(mx.isfinite(value)).item()),key
 for i,value in enumerate(random_state):assert bool(mx.array_equal(arrays['random.'+str(i)],value).item()),'Random initialization changed'
 unchanged_random(random_state)
 model.load_weights([(k[len('weights.'):],v) for k,v in arrays.items() if k.startswith('weights.')],strict=False)
 optimizer.state=tree_unflatten({k[len('optimizer.'):]:v for k,v in arrays.items() if k.startswith('optimizer.')})
 assert int(optimizer.step.item())==len(history)
 return state
