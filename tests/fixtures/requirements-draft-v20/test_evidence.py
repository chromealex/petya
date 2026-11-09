"""Reject altered evaluation provenance or incomplete semantic judgments."""
import hashlib,json,shutil,tempfile,unittest
from pathlib import Path
from evidence import baseline,R

class EvidenceTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='petya-v20-evidence-');self.addCleanup(self.temp.cleanup)
        self.results=Path(self.temp.name)
        for file in (R/'results').glob('*'):shutil.copyfile(file,self.results/file.name)
    def mutate(self,name,change,refresh=False):
        file=self.results/name;value=json.loads(file.read_text());change(value);file.write_text(json.dumps(value))
        if refresh:
            p=self.results/'baseline-provenance.json';data=json.loads(p.read_text());data['files'][name]=hashlib.sha256(file.read_bytes()).hexdigest();p.write_text(json.dumps(data))
    def test_current_evidence(self):
        result=baseline(self.results);self.assertEqual(result['check']['passed'],43);self.assertEqual(result['drafts']['passed'],11)
    def test_changed_review_file(self):
        self.mutate('parent-drafts-review.json',lambda x:x['draft-two-edits'].update(passed=True))
        with self.assertRaises(AssertionError):baseline(self.results)
    def test_missing_judgment_even_with_refreshed_file_hash(self):
        self.mutate('parent-drafts-review.json',lambda x:x.pop('draft-copies'),True)
        with self.assertRaises(AssertionError):baseline(self.results)
    def test_substituted_weights(self):
        self.mutate('parent-check.manifest.json',lambda x:x.update(adapter_sha256='0'*64),True)
        with self.assertRaises(AssertionError):baseline(self.results)
    def test_reference_leakage(self):
        self.mutate('parent-drafts.manifest.json',lambda x:x.update(reference_in_prompt=True),True)
        with self.assertRaises(AssertionError):baseline(self.results)
    def test_wrong_answer_review_hash(self):
        self.mutate('parent-drafts-review.json',lambda x:x['draft-copies'].update(answer_sha256='0'*64),True)
        with self.assertRaises(AssertionError):baseline(self.results)

if __name__=='__main__':unittest.main()
