"""Select the third v22 repair after complete familiar retention, before any holdout inference.

Recomputes the 801 familiar cases against the frozen data and the actual adapter (all exact, literal checks
passed), checks the frozen protocol, and records the selection that the holdout stage of Train Petya requires.
"""
import hashlib
import json
from pathlib import Path
import sys
R = Path(__file__).resolve().parent
sys.path.insert(0, str(R.parent/'requirements-draft-v20'))
from evidence import reviewed_run
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
protocol = json.loads((R/'repair3-protocol.json').read_text())
for name, expected in protocol['hashes'].items():
    assert sha(R/name) == expected, name
assert sha(R/'repair2-adapter/adapters.safetensors') == protocol['parent_sha256']
report = reviewed_run(R/'results/repair3-acquisition.jsonl', R/'acquisition.jsonl', R/'repair3-adapter')
assert report['total'] == 801 and report['exact'] == 801 and report['passed'] == 801 and not report['failures']
continuation = json.loads((R/'results/repair3-continuation-verification.json').read_text())
adapter = sha(R/'repair3-adapter/adapters.safetensors')
assert continuation['adapter_sha256'] == adapter and continuation['steps'] == protocol['steps']
assert continuation['exact_checkpoint_weights'] and continuation['complete_adam_and_loss_history']
selection = {
    'candidate': 'repair3-adapter', 'adapter_sha256': adapter,
    'config_sha256': sha(R/'repair3-adapter/adapter_config.json'),
    'protocol_sha256': sha(R/'repair3-protocol.json'),
    'familiar': {'total': 801, 'exact': 801, 'passed': 801, 'literal_checks': len(report['literal_checks']),
                 'answers_sha256': sha(R/'results/repair3-acquisition.jsonl')},
    'holdout_freeze_sha256': sha(R/'holdout-freeze.json'),
    'next': 'Evaluate the 42 frozen new cases (check.jsonl, fresh-drafts.jsonl) once, with the same evaluator and '
            'settings as the baseline; review every draft; keep every baseline success and improve the total '
            '(baseline 27/30 checks, 6/12 drafts). Live dialogue, runtime and packaging stay separate.',
    'limits': protocol['limits'],
}
(R/'results/repair3-selection.json').write_text(json.dumps(selection, indent=2)+'\n')
print('Selected repair3-adapter: 801/801 familiar cases; holdout not yet run.')
