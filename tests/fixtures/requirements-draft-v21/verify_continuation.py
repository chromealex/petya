"""Bind a completed adapter to its final hash-checked Adam checkpoint on CPU."""
import argparse
import hashlib
import json
import math
from pathlib import Path
import numpy as np
from safetensors import safe_open


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def verify(adapter, checkpoints, trainer, helper, data, parent):
    adapter, checkpoints = Path(adapter), Path(checkpoints)
    training = json.loads((adapter / 'training.json').read_text())
    index = json.loads((checkpoints / 'latest.json').read_text())
    steps = training['steps']
    assert type(steps) is int and steps > 0
    assert index['file'] == f'step-{steps:08d}.safetensors', 'Final checkpoint step mismatch'
    source = checkpoints / index['file']
    assert sha(source) == index['sha256'], 'Checkpoint hash mismatch'
    artifact = adapter / 'adapters.safetensors'
    assert sha(artifact) == training['adapter_sha256'], 'Adapter hash mismatch'
    with safe_open(source, framework='numpy') as saved, safe_open(artifact, framework='numpy') as final:
        state = json.loads(saved.metadata()['checkpoint'])
        run = state['run']
        assert len(run['order']) == steps, 'Training order incomplete'
        assert len(state['loss']) == steps and state['loss'] == training['loss'], 'Loss history mismatch'
        assert all(math.isfinite(v) for v in state['loss'])
        assert int(saved.get_tensor('optimizer.step')) == steps, 'Adam step mismatch'
        keys = list(saved.keys())
        assert all(np.isfinite(saved.get_tensor(k)).all() for k in keys), 'Nonfinite checkpoint tensor'
        weights = {k[len('weights.'):] for k in keys if k.startswith('weights.')}
        assert weights == set(final.keys()), 'Adapter tensor coverage mismatch'
        for key in sorted(weights):
            a, b = saved.get_tensor('weights.' + key), final.get_tensor(key)
            assert a.dtype == b.dtype and a.shape == b.shape and np.array_equal(a, b), 'Final weights mismatch: ' + key
    for field in ('epochs', 'layers'):
        assert run[field] == training[field], field
    assert run['lr'] == training['learning_rate']
    assert run['attention'] == training['attention_added']
    assert run['mlp'] == training['mlp_expanded']
    assert run['training_sha256'] == training['training_sha256'] == sha(data)
    assert run['parent_sha256'] == training['parent_sha256'] == sha(Path(parent) / 'adapters.safetensors')
    assert run['parent_config_sha256'] == sha(Path(parent) / 'adapter_config.json')
    assert run['trainer_sha256'] == sha(trainer)
    assert run['checkpoint_code_sha256'] == sha(helper)
    assert run['base_config_sha256'] == sha(Path(run['base']) / 'config.json')
    assert training['resumed'] is True
    return {'steps': steps, 'adapter_sha256': sha(artifact), 'checkpoint_sha256': index['sha256'],
            'adapter_tensor_count': len(weights), 'exact_checkpoint_weights': True,
            'complete_adam_and_loss_history': True,
            'scope': 'Completed artifact/checkpoint binding only; no answer-quality or release qualification.'}


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    for name in ('adapter', 'checkpoints', 'trainer', 'helper', 'data', 'parent'):
        p.add_argument('--' + name, type=Path, required=True)
    p.add_argument('--output', type=Path)
    a = p.parse_args()
    result = verify(a.adapter, a.checkpoints, a.trainer, a.helper, a.data, a.parent)
    text = json.dumps(result, indent=2) + '\n'
    if a.output:
        a.output.write_text(text)
    print(text, end='')
