"""Review and compare one Andromeda D stage against its parent.

Step 1 — list what still needs a human/strict review:
  python3 scripts/review_drafts.py todo d10 ~/.petya-train/andromeda-d10 > todo.txt
  Non-exact answers whose (id, answer sha256) already has a review in any requirements-draft-d*/results/*-review.json
  are reused; the rest are printed with the dialogue, the reference and the answer.

Step 2 — write the failures you found as JSON {"<id>": "<reason>", ...} (everything not listed passes), then:
  python3 scripts/review_drafts.py apply d10 ~/.petya-train/andromeda-d10 d9 failures.json
  This writes requirements-draft-d10/results/d10-<set>-review.json (hash-bound) and prints, per set, the score,
  the parent's score and which ids were lost or gained.

Strict rules (a non-exact draft fails if any holds): a requirement lost or something invented; a permission turned
into an order («Получатель — X», «Передать X»); wrong inflection («в зал 17», «293 секунд», an inflected quoted name);
a wrong summary («Копия анкеты»); wrong values; garbage or mixed-language words; a lost open question.
Run from the repository root. The 801 familiar cases live in requirements-draft-v22/acquisition.jsonl.
"""
import glob, hashlib, json, os, sys
F = 'tests/fixtures/'
SETS = ['holdout', 'v22-check', 'v22-drafts', 'familiar']
DATA = [F + 'requirements-draft-d2/holdout.jsonl', F + 'requirements-draft-v22/fresh-drafts.jsonl', F + 'requirements-draft-v22/acquisition.jsonl']
h = lambda s: hashlib.sha256(s.encode()).hexdigest()
rows = lambda p: [json.loads(x) for x in open(p)]


def known():
    out = {}
    for f in glob.glob(F + 'requirements-draft-d*/results/*-review.json'):
        for k, v in json.load(open(f)).items():
            out[(k, v['answer_sha256'])] = v
    return out


def todo(stage, work):
    rev, data, seen = known(), {}, set()
    for p in DATA:
        for r in rows(p): data[r['id']] = r
    for name in SETS:
        p = os.path.join(os.path.expanduser(work), f'{stage}-{name}.jsonl')
        if not os.path.exists(p): continue
        rs = rows(p); ex = sum(r['exactJSON'] is True for r in rs)
        if name == 'v22-check':
            print('#', name, 'exact', ex, '/', len(rs), file=sys.stderr); continue
        non = [r for r in rs if r['exactJSON'] is not True]
        got = [rev.get((r['id'], h(r['answer']))) for r in non]
        left = [r for r, v in zip(non, got) if v is None]
        print('#', name, len(rs), 'exact', ex, 'reused pass', sum(v['passed'] for v in got if v), 'to review', len(left), file=sys.stderr)
        for r in left:
            key = r['id'] + '|' + h(r['answer'])
            if key in seen: continue
            seen.add(key); d = data[r['id']]
            print('=====', r['id'])
            for m in d['messages'][1:-1]: print('  [' + m['role'][0] + ']', m['content'])
            print('  REF', d['messages'][-1]['content']); print('  >> ', r['answer'])


def apply(stage, work, parent, failures):
    rev, fail = known(), json.load(open(failures))
    out = F + f'requirements-draft-{stage}/results/'; os.makedirs(out, exist_ok=True)
    for name in SETS:
        rs = rows(os.path.join(os.path.expanduser(work), f'{stage}-{name}.jsonl'))
        ok = {r['id'] for r in rs if r['exactJSON'] is True}; mine = {}
        if name != 'v22-check':
            for r in rs:
                if r['exactJSON'] is True: continue
                a = h(r['answer']); v = rev.get((r['id'], a))
                v = {'passed': v['passed'], 'reason': v['reason'], 'answer_sha256': a} if v else \
                    {'passed': r['id'] not in fail, 'reason': fail.get(r['id'], 'Same requirements, correct Russian.'), 'answer_sha256': a}
                mine[r['id']] = v
                if v['passed']: ok.add(r['id'])
            json.dump(mine, open(out + f'{stage}-{name}-review.json', 'w'), ensure_ascii=False, indent=1)
        pdir = F + f'requirements-draft-{parent}/results/'
        prs = rows(pdir + f'{parent}-{name}.jsonl')
        prev = json.load(open(pdir + f'{parent}-{name}-review.json')) if name != 'v22-check' else {}
        pok = {r['id'] for r in prs if r['exactJSON'] is True or prev.get(r['id'], {}).get('passed')}
        print(name, json.dumps({stage: len(ok), parent: len(pok), 'total': len(rs), 'exact': sum(r['exactJSON'] is True for r in rs),
                                'lost': sorted(pok - ok), 'gained': sorted(ok - pok)}, ensure_ascii=False))


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else ''
    if cmd == 'todo' and len(sys.argv) == 4: todo(*sys.argv[2:])
    elif cmd == 'apply' and len(sys.argv) == 6: apply(*sys.argv[2:])
    else: sys.exit(__doc__)
