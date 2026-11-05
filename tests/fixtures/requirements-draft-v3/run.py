"""Train the third adapter and evaluate drafts plus extraction regressions."""
import argparse
import importlib.util
import json
from pathlib import Path
from mlx_lm import load, generate
from mlx_lm.sample_utils import make_sampler

ROOT = Path(__file__).parent
spec = importlib.util.spec_from_file_location('pilot', ROOT.parent / 'decision-lora-9b/experiment.py')
pilot = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pilot)
pilot.ROOT = ROOT
parser = argparse.ArgumentParser()
parser.add_argument('action', choices=['train', 'evaluate'])
parser.add_argument('base')
parser.add_argument('output', type=Path)
parser.add_argument('--adapter')
parser.add_argument('--data', type=Path, default=ROOT)
args = parser.parse_args()
pilot.ROOT = args.data
model, tok = load(args.base, adapter_path=args.adapter)
assert model.model_type == 'qwen3_5' and len(model.layers) == 32
if args.action == 'train':
    assert args.adapter is None, 'Train from the pinned base, not a previous candidate'
    pilot.train(model, tok, args.output)
else:
    rows = [dict(r, task='draft') for r in pilot.read('holdout.jsonl')]
    previous = ROOT.parent / 'decision-lora-9b-v2/holdout.jsonl'
    rows += [dict(r, id='regression-' + str(i)) for i,r in enumerate(
        json.loads(s) for s in previous.read_text().splitlines()) if r['task'] == 'bounds']
    with args.output.open('x') as f:
        for row in rows:
            messages = row['messages'][:-1]
            assert messages[-1]['role'] == 'user'
            answer = generate(model, tok, prompt=pilot.prompt(tok, messages),
                              sampler=make_sampler(temp=0),
                              max_tokens=450 if row['task']=='draft' else 120, verbose=False)
            f.write(json.dumps(dict(id=row['id'], topic=row['topic'], task=row['task'],
                                    answer=answer), ensure_ascii=False)+'\n')
            f.flush()
            print(row['id'], flush=True)
