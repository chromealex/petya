"""Audit completion masking and cache parity, then test four-example memorization."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import mlx.core as mx
import mlx.nn as nn
from mlx_lm import load, generate
from mlx_lm.sample_utils import make_sampler
from mlx_lm.models.cache import make_prompt_cache

ROOT=Path(__file__).parent
spec=importlib.util.spec_from_file_location('pilot',ROOT.parent/'decision-lora-9b/experiment.py')
pilot=importlib.util.module_from_spec(spec);spec.loader.exec_module(pilot)
p=argparse.ArgumentParser()
p.add_argument('action',choices=['train','evaluate'])
p.add_argument('base');p.add_argument('output',type=Path);p.add_argument('--adapter')
a=p.parse_args()
rows=[json.loads(s) for s in (ROOT/'control.jsonl').read_text().splitlines()]
model,tok=load(a.base,adapter_path=a.adapter)
model.eval()

def inspect(row):
    before=pilot.prompt(tok,row['messages'][:-1])
    assert isinstance(before,list) and all(isinstance(v,int) for v in before)
    answer=tok.encode(row['messages'][-1]['content']+'<|im_end|>',add_special_tokens=False)
    assert answer[-1] in tok.eos_token_ids
    assert tok.decode(answer[:-1])==row['messages'][-1]['content']
    tokens=mx.array([before+answer]); offset=len(before)
    logits=model(tokens[:,:-1])[:,offset-1:,:].astype(mx.float32)
    target=tokens[:,offset:]
    assert logits.shape[1]==len(answer)==target.shape[1]
    loss=nn.losses.cross_entropy(logits,target,reduction='mean').item()
    accuracy=mx.mean((mx.argmax(logits,axis=-1)==target).astype(mx.float32)).item()
    prefix_logits=model(mx.array([before]))[:,-1,:].astype(mx.float32)
    cache=make_prompt_cache(model)
    cache_logits=model(mx.array([before]),cache=cache)[:,-1,:].astype(mx.float32)
    cache_next=model(mx.array([[answer[0]]]),cache=cache)[:,-1,:].astype(mx.float32)
    full_next=model(mx.array([before+answer[:1]]))[:,-1,:].astype(mx.float32)
    result=dict(id=row['id'],promptTokens=offset,answerTokens=len(answer),loss=loss,
                teacherForcedAccuracy=accuracy,
                firstTarget=answer[0],lastTarget=answer[-1],
                causalMaxDelta=mx.max(mx.abs(logits[:,0,:]-prefix_logits)).item(),
                cachePrefillMaxDelta=mx.max(mx.abs(cache_logits-prefix_logits)).item(),
                cacheDecodeMaxDelta=mx.max(mx.abs(cache_next-full_next)).item(),
                cachedFirstToken=int(mx.argmax(cache_logits).item()),
                uncachedFirstToken=int(mx.argmax(prefix_logits).item()),
                cachedNextToken=int(mx.argmax(cache_next).item()),
                uncachedNextToken=int(mx.argmax(full_next).item()))
    response=generate(model,tok,prompt=before,sampler=make_sampler(temp=0),max_tokens=250,verbose=False)
    result['answer']=response
    try: result['exactJSON']=json.loads(response)==json.loads(row['messages'][-1]['content'])
    except ValueError: result['exactJSON']=False
    print(row['id'],result['loss'],result['exactJSON'],flush=True)
    return result

if a.action=='train':
    a.output.mkdir(exist_ok=False)
    baseline=[inspect(r) for r in rows]
    (a.output/'before.json').write_text(json.dumps(baseline,ensure_ascii=False,indent=2)+'\n')
    # Keep the original optimizer, mask, architecture and serialization code.
    # Twenty-four passes over four records are obtained via the trainer's two epochs.
    data=a.output/'data';data.mkdir()
    (data/'train.jsonl').write_text(''.join(json.dumps(r,ensure_ascii=False)+'\n' for r in rows*12))
    pilot.ROOT=data
    pilot.train(model,tok,a.output/'adapter')
else:
    results=[inspect(r) for r in rows]
    a.output.write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n')
