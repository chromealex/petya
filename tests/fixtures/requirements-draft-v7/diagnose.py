"""Measure teacher-forced errors on the exact eight failed correction targets."""
import argparse
import json
from pathlib import Path
import mlx.core as mx
import mlx.nn as nn
from mlx_lm import load,generate
from mlx_lm.sample_utils import make_sampler
p=argparse.ArgumentParser();p.add_argument('base');p.add_argument('adapter');p.add_argument('output',type=Path);a=p.parse_args()
root=Path(__file__).parent
rows=[json.loads(s) for s in (root.parent/'requirements-draft-v6/corrected.jsonl').read_text().splitlines()]
model,tok=load(a.base,adapter_path=a.adapter);model.eval()
results=[]
for row in rows:
 prefix=tok.apply_chat_template(row['messages'][:-1],add_generation_prompt=True,enable_thinking=False)
 target=tok.encode(row['messages'][-1]['content']+'<|im_end|>',add_special_tokens=False)
 tokens=mx.array([prefix+target]);logits=model(tokens[:,:-1])[:,len(prefix)-1:,:].astype(mx.float32)
 losses=nn.losses.cross_entropy(logits,mx.array([target]),reduction='none')
 pred=mx.argmax(logits,axis=-1)[0].tolist();lv=losses[0].tolist()
 errors=[dict(position=i,target=tok.decode([v]),predicted=tok.decode([pred[i]]),loss=lv[i]) for i,v in enumerate(target) if v!=pred[i]]
 answer=generate(model,tok,prompt=prefix,sampler=make_sampler(temp=0),max_tokens=450 if row['task']=='draft' else 120,verbose=False)
 try:exact=json.loads(answer)==json.loads(row['messages'][-1]['content'])
 except ValueError:exact=False
 result=dict(id=row['id'],task=row['task'],tokens=len(target),meanLoss=sum(lv)/len(lv),teacherAccuracy=1-len(errors)/len(target),errors=errors,answer=answer,exactJSON=exact)
 results.append(result);print(row['id'],result['meanLoss'],result['teacherAccuracy'],len(errors),flush=True)
a.output.write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n')
