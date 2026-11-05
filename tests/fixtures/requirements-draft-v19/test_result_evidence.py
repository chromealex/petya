"""Reject plausible corruptions without running GPU inference."""
import contextlib
import io
import json
import shutil
import tempfile
import unittest
from pathlib import Path
from verify_results import R, digest, verify_baselines, verify_acquisition


class EvidenceChecks(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='petya-evidence-')
        self.addCleanup(self.temp.cleanup)
        self.results = Path(self.temp.name) / 'results'
        shutil.copytree(R / 'results', self.results)

    def change_json(self, name, mutate):
        path = self.results / name
        obj = json.loads(path.read_text())
        mutate(obj)
        path.write_text(json.dumps(obj))

    def check_rejected(self):
        with self.assertRaises(AssertionError), contextlib.redirect_stdout(io.StringIO()):
            verify_baselines(self.results)

    def test_failed_acquisition_cannot_be_selected(self):
        with contextlib.redirect_stdout(io.StringIO()):
            result = verify_acquisition(self.results, R / 'adapter')
            self.assertEqual(result['semantic_passed'], 566)
            self.assertEqual(len(result['failed']), 3)
            with self.assertRaisesRegex(AssertionError, 'Retention gate failed'):
                verify_acquisition(self.results, R / 'adapter', require_retention=True)

    def test_substituted_weights(self):
        self.change_json('parent-check.manifest.json', lambda m: m.update(adapter_sha256='0' * 64))
        self.check_rejected()

    def test_reference_leak_declaration(self):
        self.change_json('parent-check.manifest.json', lambda m: m.update(reference_in_prompt=True))
        self.check_rejected()

    def test_modified_answer(self):
        path = self.results / 'parent-check.jsonl'
        rows = path.read_text().splitlines()
        row = json.loads(rows[0])
        row['answer'] = '{}'
        rows[0] = json.dumps(row)
        path.write_text('\n'.join(rows) + '\n')
        self.check_rejected()

    def test_incorrect_score_even_with_updated_file_hash(self):
        path = self.results / 'parent-check.jsonl'
        rows = path.read_text().splitlines()
        row = json.loads(rows[0])
        row['exactJSON'] = not row['exactJSON']
        rows[0] = json.dumps(row)
        path.write_text('\n'.join(rows) + '\n')
        self.change_json('baseline-review-provenance.json', lambda p: p['answers'].update({'parent-check.jsonl': digest(path)}))
        self.check_rejected()

    def test_missing_semantic_judgment(self):
        self.change_json('manual-review.json', lambda r: r['parent'].pop(next(iter(r['parent']))))
        self.check_rejected()


if __name__ == '__main__':
    unittest.main()
