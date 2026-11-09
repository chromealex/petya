"""Check cross-process Adam continuation on a real small MLX model, using CPU."""
import json,subprocess,sys,tempfile
from pathlib import Path
import mlx.core as mx
import mlx.nn as nn
import mlx.optimizers as optim
import checkpoint
mx.set_default_device(mx.cpu)

def setup():
 mx.random.seed(42);model=nn.Linear(3,2);optimizer=optim.Adam(learning_rate=0.001)
 return model,optimizer,list(mx.random.state)
run={'order':list(range(12)),'recipe':'checkpoint-test'}

def worker(directory,stop,resume):
 model,optimizer,random_state=setup();history=[]
 if resume:history=checkpoint.restore(directory,model,optimizer,run,random_state)['loss']
 def loss(net,x):return mx.mean((net(x)-mx.array([[0.2,-0.3]]))**2)
 gradient=nn.value_and_grad(model,loss)
 for i in range(len(history),stop):
  value,grads=gradient(model,mx.array([[i/12,0.3,-0.4]]));optimizer.update(model,grads);mx.eval(model.trainable_parameters(),optimizer.state,value)
  history.append(value.item())
  if len(history)%3==0 or len(history)==stop:checkpoint.write(directory,model,optimizer,run,history,random_state,0,0)

if len(sys.argv)>1:
 worker(Path(sys.argv[1]),int(sys.argv[2]),sys.argv[3]=='resume')
else:
 with tempfile.TemporaryDirectory(prefix='petya-checkpoints-') as tmp:
  full,split=Path(tmp)/'full',Path(tmp)/'split'
  for directory,stop,mode in [(full,12,'new'),(split,5,'new'),(split,12,'resume')]:
   subprocess.run([sys.executable,__file__,str(directory),str(stop),mode],check=True)
  def load(directory):
   index=json.loads((directory/'latest.json').read_text());return mx.load(str(directory/index['file']),return_metadata=True)
  a,meta_a=load(full);b,meta_b=load(split)
  assert a.keys()==b.keys()
  assert all(bool(mx.array_equal(a[k],b[k]).item()) for k in a),'Resumed tensors differ'
  assert json.loads(meta_a['checkpoint'])['loss']==json.loads(meta_b['checkpoint'])['loss'],'Resumed losses differ'
  assert len(list(split.glob('step-*.safetensors')))==2
  # Incomplete staged writes must not replace the committed pointer.
  (split/'step-00000013.safetensors.pending.safetensors').write_bytes(b'partial')
  model,optimizer,random_state=setup();checkpoint.restore(split,model,optimizer,run,random_state)
  try:checkpoint.restore(split,model,optimizer,{**run,'recipe':'other'},random_state)
  except AssertionError:pass
  else:raise AssertionError('Changed recipe accepted')
  mx.eval(mx.random.normal((2,)))
  try:checkpoint.unchanged_random(random_state)
  except AssertionError:pass
  else:raise AssertionError('Stochastic state change accepted')
  index=json.loads((split/'latest.json').read_text());target=split/index['file'];raw=target.read_bytes();target.write_bytes(raw[:-1]+bytes([raw[-1]^1]))
  model,optimizer,random_state=setup()
  try:checkpoint.restore(split,model,optimizer,run,random_state)
  except AssertionError as error:assert 'bytes changed' in str(error)
  else:raise AssertionError('Corrupt checkpoint accepted')
 print('Checkpoint tests passed: exact cross-process weights, Adam moments/step and losses; changed recipe, corruption, random-state guard, staged writes and two-generation retention.')
