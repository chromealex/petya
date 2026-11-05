"""Train or evaluate a numeric decision adapter on Apple silicon."""
import argparse
import hashlib
import json
import math
import random
from pathlib import Path

ROOT = Path(__file__).parent
REPO = 'mlx-community/Qwen3.5-9B-4bit'
REVISION = '8b2b98c00a6b4d291155e4890773ca8f769aee53'
SEED = 42

def read(name):
    return [json.loads(s) for s in (ROOT/name).read_text().splitlines()]

def prompt(tok, messages):
    return tok.apply_chat_template(messages, add_generation_prompt=True, enable_thinking=False)

def train(model, tok, destination):
    import mlx.core as mx
    import mlx.nn as nn
    import mlx.optimizers as optim
    from mlx.utils import tree_flatten
    from mlx_lm.tuner.utils import linear_to_lora_layers

    if destination.exists():
        raise FileExistsError(destination)
    mx.random.seed(SEED)
    model.freeze()
    params = dict(keys=['self_attn.v_proj', 'self_attn.o_proj', 'mlp.down_proj'],
                  rank=8, scale=2.0, dropout=0.0)
    linear_to_lora_layers(model, 1, params)
    # Only the last full-attention block has trainable weights. Frozen recurrent
    # blocks can keep their fast inference kernels; adapter dropout is zero.
    model.eval()
    tensors = dict(tree_flatten(model.trainable_parameters()))
    assert len(tensors)==6 and all(k.endswith(('lora_a','lora_b')) for k in tensors)
    param_count = sum(v.size for v in tensors.values())
    sequences = []
    for row in read('train.jsonl'):
        messages = row['messages']
        before = prompt(tok, messages[:-1])
        # Encode the supervised completion with the same no-thinking prefix as generation.
        answer = tok.encode(messages[-1]['content']+'<|im_end|>', add_special_tokens=False)
        assert answer[-1] in tok.eos_token_ids and len(before)+len(answer) <= 512
        sequences.append((mx.array([before+answer]), len(before)))

    def loss_fn(net, tokens, offset):
        logits = net(tokens[:, :-1])[:, offset-1:, :]
        return nn.losses.cross_entropy(logits.astype(mx.float32), tokens[:, offset:], reduction='mean')

    gradient = nn.value_and_grad(model, loss_fn)
    optimizer = optim.Adam(learning_rate=0.00015)
    rng = random.Random(SEED)
    history = []
    print('Trainable parameters:', param_count, flush=True)
    for epoch in range(2):
        order = list(range(len(sequences)))
        rng.shuffle(order)
        for index in order:
            tokens,offset = sequences[index]
            loss,grads = gradient(model,tokens,offset)
            optimizer.update(model,grads)
            mx.eval(model.trainable_parameters(),optimizer.state,loss)
            value = loss.item()
            if not math.isfinite(value):
                raise ValueError('Non-finite loss')
            history.append(value)
            if len(history)%8==0:
                print('Step',len(history),'mean loss',round(sum(history[-8:])/8,5),flush=True)
    weights = dict(tree_flatten(model.trainable_parameters()))
    assert all(bool(mx.all(mx.isfinite(v)).item()) for v in weights.values())
    assert all(float(mx.max(mx.abs(v)).item())>0 for k,v in weights.items() if k.endswith('lora_b'))
    destination.mkdir(parents=True)
    artifact=destination/'adapters.safetensors'
    mx.save_safetensors(str(artifact),weights)
    config=dict(fine_tune_type='lora',num_layers=1,lora_parameters=params,model=REPO,revision=REVISION)
    (destination/'adapter_config.json').write_text(json.dumps(config,indent=2)+'\n')
    run=dict(seed=SEED,steps=len(history),learning_rate=0.00015,trainable_parameters=param_count,
             training_sha256=hashlib.sha256((ROOT/'train.jsonl').read_bytes()).hexdigest(),
             adapter_sha256=hashlib.sha256(artifact.read_bytes()).hexdigest(),loss=history)
    (destination/'training.json').write_text(json.dumps(run,indent=2)+'\n')

def evaluate(model,tok,output):
    from mlx_lm import generate
    from mlx_lm.sample_utils import make_sampler
    with output.open('x') as f:
        for i,row in enumerate(read('holdout.jsonl')):
            messages=row['messages']
            answer=generate(model,tok,prompt=prompt(tok,messages[:-1]),sampler=make_sampler(temp=0),max_tokens=120,verbose=False)
            f.write(json.dumps(dict(id=i,topic=row['topic'],answer=answer),ensure_ascii=False)+'\n')
            f.flush()

if __name__=='__main__':
    import mlx.core as mx
    from mlx_lm import load
    parser=argparse.ArgumentParser()
    parser.add_argument('action',choices=['train','evaluate'])
    parser.add_argument('base')
    parser.add_argument('output',type=Path)
    parser.add_argument('--adapter')
    args=parser.parse_args()
    model,tokenizer=load(args.base,adapter_path=args.adapter)
    if model.model_type!='qwen3_5' or len(model.layers)!=32:
        raise ValueError('Unexpected base architecture')
    mx.random.seed(SEED)
    if args.action=='train':
        train(model,tokenizer,args.output)
    else:
        evaluate(model,tokenizer,args.output)
