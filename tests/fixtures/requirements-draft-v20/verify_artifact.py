"""Check actual adapter tensors, coverage, finite values and frozen provenance."""
import argparse,hashlib,json,math,re
from pathlib import Path
import numpy as np
from safetensors import safe_open
R=Path(__file__).resolve().parent
p=argparse.ArgumentParser();p.add_argument('artifact',type=Path);p.add_argument('--output',type=Path);p.add_argument('--protocol',type=Path,default=R/'protocol.json');a=p.parse_args()
digest=lambda path:hashlib.sha256(path.read_bytes()).hexdigest()
protocol=json.loads(a.protocol.read_text())
metadata=json.loads((a.artifact/'training.json').read_text())
config=json.loads((a.artifact/'adapter_config.json').read_text())
parent=(R/protocol['parent']).resolve()
assert metadata['parent_sha256']==digest(parent/'adapters.safetensors')==protocol['parent_sha256']
data=R/protocol.get('training_file','train.jsonl')
expected=protocol['hashes'][data.name]
assert metadata['training_sha256']==digest(data)==expected
assert metadata['adapter_sha256']==digest(a.artifact/'adapters.safetensors')
for field in ['steps','layers','epochs','seed','learning_rate']:assert metadata[field]==protocol[field],field
assert len(metadata['loss'])==metadata['steps'] and all(map(math.isfinite,metadata['loss']))
assert config['num_layers']==32 and config['lora_parameters']['rank']==8
coverage={i:[] for i in range(32)};parameters=0
with safe_open(a.artifact/'adapters.safetensors',framework='numpy') as f:
 keys=set(f.keys())
 for key in sorted(keys):
  match=re.fullmatch(r'language_model\.model\.layers\.(\d+)\.(.+)\.lora_([ab])',key)
  assert match,key
  layer,module,side=int(match[1]),match[2],match[3]
  assert layer in coverage
  tensor=f.get_tensor(key)
  assert np.isfinite(tensor).all(),key
  assert tensor.ndim==2 and 8 in tensor.shape,key
  parameters+=tensor.size
  other=key[:-1]+('b' if side=='a' else 'a');assert other in keys
  if side=='a':coverage[layer].append(module)
assert parameters==metadata['trainable_parameters']==14548992
for layer,modules in coverage.items():
 assert {'mlp.down_proj','mlp.gate_proj','mlp.up_proj'}<=set(modules),layer
 full_attention={'self_attn.q_proj','self_attn.k_proj','self_attn.v_proj','self_attn.o_proj'}
 if layer%4==3:assert full_attention<=set(modules),layer
 else:assert not any(x.startswith('self_attn.') for x in modules),layer
result={'artifact_sha256':metadata['adapter_sha256'],'tensor_count':len(keys),'trainable_parameters':parameters,'adapted_blocks':32,'full_attention_blocks':8,'mlp_blocks':32,'linear_attention_projections_adapted':False,'coverage':coverage,'finite_tensors':True,'scope':'Artifact integrity and architecture coverage only; not quality or release readiness.'}
if a.output:a.output.write_text(json.dumps(result,indent=2)+'\n')
print('Verified',len(keys),'finite tensors;',parameters,'parameters; MLP in 32 blocks, attention projections in eight full-attention blocks.')
