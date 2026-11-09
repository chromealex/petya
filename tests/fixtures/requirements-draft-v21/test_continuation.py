"""Reject incomplete or mismatched final artifacts even with fresh file hashes."""
import copy
import json
import tempfile
from pathlib import Path
import numpy as np
from safetensors.numpy import save_file
from verify_continuation import sha, verify

with tempfile.TemporaryDirectory(prefix='petya-final-binding-') as tmp:
    root = Path(tmp)
    adapter, checkpoints, parent, base = [root / x for x in ('adapter', 'checkpoints', 'parent', 'base')]
    for p in (adapter, checkpoints, parent, base):
        p.mkdir()
    trainer, helper, data = [root / x for x in ('trainer.py', 'helper.py', 'data.jsonl')]
    for p in (trainer, helper, data, parent / 'adapters.safetensors', parent / 'adapter_config.json', base / 'config.json'):
        p.write_text(p.name)
    weights = {'layer.lora_a': np.array([[1., 2.]], dtype=np.float32)}
    run = {'order': [0, 1], 'epochs': 1, 'layers': 1, 'lr': 0.001, 'attention': True, 'mlp': True,
           'training_sha256': sha(data), 'parent_sha256': sha(parent / 'adapters.safetensors'),
           'parent_config_sha256': sha(parent / 'adapter_config.json'), 'trainer_sha256': sha(trainer),
           'checkpoint_code_sha256': sha(helper), 'base': str(base), 'base_config_sha256': sha(base / 'config.json')}
    state = {'run': run, 'loss': [0.3, 0.2]}
    tensors = {'weights.layer.lora_a': weights['layer.lora_a'], 'optimizer.step': np.array(2, dtype=np.uint64),
               'optimizer.state.m': np.array([0.1], dtype=np.float32)}
    training = {'steps': 2, 'loss': state['loss'], 'epochs': 1, 'layers': 1, 'learning_rate': 0.001,
                'attention_added': True, 'mlp_expanded': True, 'resumed': True,
                'training_sha256': run['training_sha256'], 'parent_sha256': run['parent_sha256']}

    def write(s=state, t=tensors, w=weights):
        save_file(w, adapter / 'adapters.safetensors')
        record = {**training, 'adapter_sha256': sha(adapter / 'adapters.safetensors')}
        (adapter / 'training.json').write_text(json.dumps(record))
        target = checkpoints / 'step-00000002.safetensors'
        save_file(t, target, metadata={'checkpoint': json.dumps(s)})
        (checkpoints / 'latest.json').write_text(json.dumps({'file': target.name, 'sha256': sha(target)}))

    def check():
        return verify(adapter, checkpoints, trainer, helper, data, parent)

    def rejected(label):
        try:
            check()
        except AssertionError:
            return
        raise AssertionError('Accepted ' + label)

    write()
    assert check()['exact_checkpoint_weights']
    write(w={'layer.lora_a': np.array([[1., 3.]], dtype=np.float32)})
    rejected('changed final weights with updated artifact hash')
    write(t={**tensors, 'optimizer.step': np.array(1, dtype=np.uint64)})
    rejected('incomplete Adam counter')
    altered = copy.deepcopy(state)
    altered['run']['order'].append(0)
    write(s=altered)
    rejected('unfinished epoch')
    write(t={**tensors, 'optimizer.state.m': np.array([np.nan], dtype=np.float32)})
    rejected('nonfinite optimizer state')
    write()
    trainer.write_text('changed')
    rejected('changed trainer')
print('Final continuation checks passed: exact binding and five invalid artifacts rejected.')
