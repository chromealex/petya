"""Recompute evidence scores and bind each run to its data and actual adapter."""
import argparse
import hashlib
import json
import sys
from pathlib import Path

R = Path(__file__).resolve().parent
sys.path.insert(0, str(R.parent / 'requirements-draft-v8'))
from scoring import score
from literal_check import assess


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def read(path):
    return [json.loads(line) for line in Path(path).read_text().splitlines()]


def verify_run(output, dataset, adapter):
    refs = {row['id']: row for row in read(dataset)}
    rows = read(output)
    assert len(rows) == len(refs) and {x['id'] for x in rows} == set(refs), 'Incomplete or duplicate coverage'
    manifest = json.loads(output.with_suffix('.manifest.json').read_text())
    assert manifest['data_sha256'] == digest(dataset), 'Wrong dataset'
    base_provenance = json.loads((R.parent / 'petya-v1-provenance/manifest.json').read_text())
    assert Path(manifest['base']).name == base_provenance['model_revision'], 'Wrong base revision'
    assert manifest['reference_in_prompt'] is False and manifest['thinking'] is False
    assert manifest['temperature'] == 0 and manifest['max_tokens'] == {'draft': 450, 'other': 120}
    if adapter is None:
        assert manifest['adapter'] is None and 'adapter_sha256' not in manifest
    else:
        assert manifest['adapter_sha256'] == digest(adapter / 'adapters.safetensors'), 'Wrong adapter'
        assert manifest['config_sha256'] == digest(adapter / 'adapter_config.json'), 'Wrong adapter config'
    for row in rows:
        ref = refs[row['id']]
        assert row['task'] == ref['task']
        recalculated = score(ref, row['answer'])
        assert row['schemaValid'] == recalculated['schemaValid'], row['id']
        assert row['exactJSON'] == recalculated['exactJSON'], row['id']
    return rows, refs


def verify_baselines(results):
    protocol = json.loads((R / 'protocol.json').read_text())
    provenance = json.loads((results / 'baseline-review-provenance.json').read_text())
    assert set(provenance['answers']) == {'base-check.jsonl', 'parent-check.jsonl', 'historical-check.jsonl', 'parent-release.jsonl'}
    for filename, expected in provenance['answers'].items():
        assert digest(results / filename) == expected, 'Reviewed answers changed'
    reviews = json.loads((results / 'manual-review.json').read_text())
    scores = json.loads((results / 'scores.json').read_text())
    adapters = {'base': None, 'parent': (R / protocol['parent']).resolve(), 'historical': R.parent / 'requirements-draft-v8/adapter'}
    assert set(reviews) >= set(adapters)
    for name, adapter in adapters.items():
        rows, refs = verify_run(results / (name + '-check.jsonl'), R / 'check.jsonl', adapter)
        grades = reviews[name]
        assert set(grades) == {x['id'] for x in rows if x['task'] == 'draft'}
        for grade in grades.values():
            assert len(grade) == 2 and type(grade[0]) is bool and isinstance(grade[1], str) and grade[1].strip()
        passed = 0
        for row in rows:
            if row['task'] != 'draft':
                continue
            literal = assess(refs[row['id']], row['answer'])
            passed += bool(row['schemaValid'] and grades[row['id']][0] and (literal is None or literal['passed']))
        assert scores[name]['draft'] == {'passed': passed, 'total': len(grades)}
        for task in ['bounds', 'general']:
            part = [x for x in rows if x['task'] == task]
            assert scores[name][task] == {'passed': sum(x['exactJSON'] for x in part), 'total': len(part)}
    rows, _ = verify_run(results / 'parent-release.jsonl', R / 'release-dialogues.jsonl', adapters['parent'])
    grades = json.loads((results / 'release-manual-review.json').read_text())['parent']
    assert set(grades) == {x['id'] for x in rows}
    assert all(type(v[0]) is bool and isinstance(v[1], str) and v[1].strip() for v in grades.values())
    total = json.loads((results / 'release-scores.json').read_text())['parent']
    assert total['passed'] == sum(row['schemaValid'] and grades[row['id']][0] for row in rows)
    assert total['total'] == len(rows)
    assert set(total['failures']) == {row['id'] for row in rows if not (row['schemaValid'] and grades[row['id']][0])}
    print('Verified 268 baseline answers, raw hashes, adapter/data provenance, recomputed scores and review coverage. This does not independently validate human judgments or prove release readiness.')


def verify_acquisition(results, adapter, run_name='acquisition', require_retention=False):
    rows, refs = verify_run(results / (run_name + '.jsonl'), R / 'acquisition.jsonl', adapter)
    reviews = json.loads((results / (run_name + '-review.json')).read_text())
    assert set(reviews) == {x['id'] for x in rows if not x['exactJSON']}, 'Review coverage mismatch'
    failures = []
    for row in rows:
        passed = row['schemaValid'] and row['exactJSON']
        if not row['exactJSON']:
            review = reviews[row['id']]
            assert type(review['passed']) is bool and isinstance(review['reason'], str) and review['reason'].strip()
            assert review['answer_sha256'] == hashlib.sha256(row['answer'].encode()).hexdigest(), 'Reviewed answer changed'
            passed = row['schemaValid'] and row['task'] == 'draft' and review['passed']
        literal = assess(refs[row['id']], row['answer'])
        passed = passed and (literal is None or literal['passed'])
        if not passed:
            failures.append(row['id'])
    result = {'total': len(rows), 'exact': sum(x['exactJSON'] for x in rows),
              'semantic_passed': len(rows) - len(failures), 'failed': failures,
              'acquisition_passed': not failures}
    print(json.dumps(result, indent=2))
    if require_retention:
        assert not failures, 'Retention gate failed; do not select for fresh evaluation'
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--results', type=Path, default=R / 'results')
    parser.add_argument('--stage', choices=['baseline', 'acquisition'], default='baseline')
    parser.add_argument('--adapter', type=Path, default=R / 'adapter')
    parser.add_argument('--run-name', default='acquisition')
    parser.add_argument('--require-retention', action='store_true')
    args = parser.parse_args()
    if args.stage == 'baseline':
        verify_baselines(args.results)
    else:
        verify_acquisition(args.results, args.adapter, args.run_name, args.require_retention)
