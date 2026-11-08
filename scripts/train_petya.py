"""One click from «Train Petya.app»: the next training stage of Petya's models, as frozen in its execution plan.

The plan (`scripts/train-plan.json` names it) lists the evaluations of the parent model, the training run (initial 16
steps, then resume with Adam state, again after a Metal GPU failure), the artifact and continuation checks and the
evaluations of the trained model. Every stage that is already done is skipped, so running it again continues where it
stopped. Only the commands of the plan run; the frozen inputs are checked against the protocol first.
"""
import hashlib, json, subprocess, sys, time
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
plan = json.loads((ROOT/json.loads((ROOT/'scripts/train-plan.json').read_text())['plan']).read_text())
protocol_path = ROOT/plan['protocol']; protocol = json.loads(protocol_path.read_text()); folder = protocol_path.parent
work = Path(plan['work']); checkpoints = work/'checkpoints'; adapter = work/'adapter'
parent = (folder/protocol['parent']).resolve()
sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()
def say(*text): print(time.strftime('%H:%M:%S'), *text, flush=True)
def run(name, arguments, log):
    say('Starting:', name)
    with open(work/log, 'a') as out:
        code = subprocess.run(['/usr/bin/arch', '-arm64', plan['python'], '-B', *arguments], cwd=ROOT, stdout=out, stderr=subprocess.STDOUT).returncode
    say(name, 'exit', code); return code
if plan.get('merges'):
    # A merge plan builds interpolated adapters from published parts and evaluates each; nothing is trained.
    for item in plan['inputs']:
        assert sha(Path(item['path'])/'adapters.safetensors') == item['sha256'], 'Changed input adapter ' + item['path']
for name, expected in protocol['hashes'].items():
    assert sha(folder/name) == expected, 'Changed data: ' + name
assert sha(parent/'adapters.safetensors') == protocol['parent_sha256'], 'Changed parent adapter'
for name, expected in protocol['sources'].items():
    assert sha(ROOT/name) == expected, 'Changed source: ' + name
if not Path(plan['python']).exists():
    # The environment lives outside the repository and survives a restart; it is recreated from the pinned list.
    env = Path(plan['python']).parents[1]
    say('Creating training environment', env)
    subprocess.run([sys.executable, '-m', 'venv', str(env)], check=True)
    subprocess.run(['/usr/bin/arch', '-arm64', plan['python'], '-m', 'pip', 'install', '-q', '-r', str(ROOT/'scripts/train-requirements.txt')], check=True)
assert Path(plan['python']).exists(), 'Missing training environment ' + plan['python']
work.mkdir(parents=True, exist_ok=True)
def evaluate(items, model):
    for item in items:
        out = work/item['output']
        if out.with_suffix('.manifest.json').exists() and out.exists() and len(out.read_text().splitlines()) == len((ROOT/item['data']).read_text().splitlines()):
            continue
        out.unlink(missing_ok=True); out.with_suffix('.manifest.json').unlink(missing_ok=True)
        if run(item['name'], ['-u', plan['evaluator'], plan['base'], item['data'], str(out), '--adapter', str(model)], 'evaluation.log'):
            sys.exit(item['name'] + ' failed: see ' + str(work/'evaluation.log'))
if plan.get('merges'):
    for merge in plan['merges']:
        target = work/merge['name']
        if not (target/'adapters.safetensors').exists():
            if run('Merge ' + merge['name'], [str(ROOT/'scripts/merge_adapters.py'), str(target), *[p + ':' + str(w) for p, w in merge['adapters']]], 'merge.log'):
                sys.exit('Merge failed: see ' + str(work/'merge.log'))
        say(merge['name'], sha(target/'adapters.safetensors'))
        evaluate([{**e, 'name': merge['name'] + ' · ' + e['name'], 'output': merge['name'] + '-' + e['output']} for e in plan['evaluations']], target)
    say('Merges done: evaluations captured. Review and the comparison with D1 come next.')
    sys.exit(0)
evaluate(plan.get('parent_evaluations', []), parent)
train = [plan['trainer'], plan['base'], str(folder/protocol['training_file']), str(adapter), '--parent', str(parent), '--epochs', str(protocol['epochs']),
         '--lr', str(protocol['learning_rate']), '--layers', str(protocol['layers']), '--checkpoint-dir', str(checkpoints)]
if not adapter.exists():
    if not (checkpoints/'latest.json').exists():
        if run('Initial 16 steps', train + ['--stop-after', str(plan['initial_stop_after'])], 'initial-training.log'): sys.exit('Initial training failed: see ' + str(work/'initial-training.log'))
    attempt = 0
    while not adapter.exists():
        attempt += 1
        if attempt > plan['resume_retries']: sys.exit('Training stopped repeatedly: see ' + str(work/'training.log'))
        if run('Resume with Adam state (attempt %d)' % attempt, train + ['--resume'], 'training.log') and not adapter.exists(): time.sleep(60)
say('Training complete:', sha(adapter/'adapters.safetensors'))
for name, arguments, done in [
    ('Verify completed artifact', [plan['verify_artifact'], str(adapter), '--protocol', str(protocol_path), '--output', str(work/'adapter-verification.json')], work/'adapter-verification.json'),
    ('Bind final checkpoint and Adam state', [plan['verify_continuation'], '--adapter', str(adapter), '--checkpoints', str(checkpoints), '--trainer', plan['trainer'], '--helper', plan['helper'],
     '--data', str(folder/protocol['training_file']), '--parent', str(parent), '--output', str(work/'continuation-verification.json')], work/'continuation-verification.json')]:
    if done.exists(): continue
    if run(name, arguments, 'verification.log'): sys.exit(name + ' failed: see ' + str(work/'verification.log'))
evaluate(plan.get('trained_evaluations', []), adapter)
say('Stage done: evaluations captured. Review and the comparison with the parent come next.')
