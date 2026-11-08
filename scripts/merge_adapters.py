"""Interpolate LoRA adapters exactly: W = Σ wᵢ·Aᵢ·Bᵢ becomes one adapter of rank Σ rᵢ.

MLX LoRA adds scale·(x·A)·B. Concatenating the A matrices along the rank axis and the B matrices, each multiplied by
its weight, gives exactly the weighted sum of the deltas. All inputs must share the base model, modules, layers and
scale. Usage: merge_adapters.py OUT ADAPTER_DIR:WEIGHT [ADAPTER_DIR:WEIGHT ...]
"""
import json, sys
from pathlib import Path
import numpy as np
from safetensors.numpy import load_file, save_file
out = Path(sys.argv[1]); parts = [(Path(a.rsplit(':', 1)[0]), float(a.rsplit(':', 1)[1])) for a in sys.argv[2:]]
configs = [json.loads((p / 'adapter_config.json').read_text()) for p, _ in parts]
same = lambda c: (c['model'], c['revision'], c['num_layers'], sorted(c['lora_parameters']['keys']), c['lora_parameters']['scale'])
assert len({json.dumps(same(c)) for c in configs}) == 1, 'adapters differ in base, layers, modules or scale'
tensors = [load_file(str(p / 'adapters.safetensors')) for p, _ in parts]
assert len({tuple(sorted(t)) for t in tensors}) == 1, 'adapters differ in tensors'
merged = {}
for key in tensors[0]:
    if key.endswith('.lora_a'):
        merged[key] = np.concatenate([t[key] for t in tensors], axis=1)
    elif key.endswith('.lora_b'):
        merged[key] = np.concatenate([w * t[key] for t, (_, w) in zip(tensors, parts)], axis=0)
    else:
        raise SystemExit('unexpected tensor ' + key)
out.mkdir(parents=True, exist_ok=True)
save_file(merged, str(out / 'adapters.safetensors'))
config = dict(configs[0]); config['lora_parameters'] = dict(config['lora_parameters'], rank=sum(c['lora_parameters']['rank'] for c in configs))
config['merged_from'] = [{'adapter': str(p), 'weight': w} for p, w in parts]
(out / 'adapter_config.json').write_text(json.dumps(config, indent=2) + '\n')
print('Merged', len(parts), 'adapters into rank', config['lora_parameters']['rank'], '->', out)
