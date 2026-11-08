"""Exercise corruption, substitution and loader-discovery boundaries without MLX."""
import runtime_test_path
import json
from pathlib import Path
import tempfile
import unittest
from artifacts import ArtifactError, manifest_digest, sha256_file, verify_bundle


class ArtifactTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='petya-artifact-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.base, self.adapter = self.root/'base', self.root/'adapter'
        self.base.mkdir();self.adapter.mkdir()
        for name in ['config.json','tokenizer.json','tokenizer_config.json','chat_template.jinja']:(self.base/name).write_text('{}')
        (self.base/'model.safetensors').write_bytes(b'base-test-data')
        (self.base/'model.safetensors.index.json').write_text(json.dumps({'weight_map':{'weight':'model.safetensors'}}))
        (self.adapter/'adapters.safetensors').write_bytes(b'adapter-test-data')
        (self.adapter/'adapter_config.json').write_text(json.dumps({'model':'test/base','revision':'a'*40}))
        files=lambda root:{p.name:{'bytes':p.stat().st_size,'sha256':sha256_file(p)} for p in root.iterdir()}
        self.manifest={'format_version':1,'name':'petya-development','qualification':'development','base':{'repository':'test/base','revision':'a'*40,'files':files(self.base)},'adapter':{'files':files(self.adapter)}}
        self.path=self.root/'manifest.json';self.save()

    def save(self):
        self.path.write_text(json.dumps(self.manifest))
        self.digest=manifest_digest(self.manifest)

    def verify(self):return verify_bundle(self.path,self.base,self.adapter,self.digest)

    def test_identity_and_progress(self):
        progress=[]
        identity=verify_bundle(self.path,self.base,self.adapter,self.digest,progress.append)
        self.assertEqual(identity.digest,self.digest)
        self.assertEqual(identity.qualification,'development')
        self.assertEqual(len(progress),8)
        self.assertEqual([e['verified_bytes'] for e in progress],sorted(e['verified_bytes'] for e in progress))
        self.assertEqual(progress[-1]['verified_bytes'],identity.size)
        self.assertTrue(all(e['total_bytes']==identity.size for e in progress))
        self.assertEqual(identity.size,sum(e['bytes'] for group in ['base','adapter'] for e in self.manifest[group]['files'].values()))

    def test_changed_bytes_same_size(self):
        (self.adapter/'adapters.safetensors').write_bytes(b'Adapter-test-data')
        with self.assertRaisesRegex(ArtifactError,'Хеш'):self.verify()

    def test_changed_manifest_without_new_pin(self):
        self.manifest['name']='other';self.path.write_text(json.dumps(self.manifest))
        with self.assertRaisesRegex(ArtifactError,'Манифест'):self.verify()

    def test_extra_loader_file(self):
        (self.base/'special_tokens_map.json').write_text('{}')
        with self.assertRaisesRegex(ArtifactError,'Незаявленные'):self.verify()

    def test_missing_shard(self):
        (self.base/'model.safetensors').unlink()
        with self.assertRaisesRegex(ArtifactError,'Не найден'):self.verify()

    def test_path_traversal(self):
        self.manifest['base']['files']['../escape']={'bytes':0,'sha256':'0'*64};self.save()
        with self.assertRaisesRegex(ArtifactError,'Небезопасное'):self.verify()

    def test_adapter_base_mismatch(self):
        file=self.adapter/'adapter_config.json';file.write_text(json.dumps({'model':'different','revision':'a'*40}))
        self.manifest['adapter']['files'][file.name]={'bytes':file.stat().st_size,'sha256':sha256_file(file)};self.save()
        with self.assertRaisesRegex(ArtifactError,'другой базовой'):self.verify()

    def test_index_points_outside_manifest(self):
        file=self.base/'model.safetensors.index.json';file.write_text(json.dumps({'weight_map':{'weight':'missing.safetensors'}}))
        self.manifest['base']['files'][file.name]={'bytes':file.stat().st_size,'sha256':sha256_file(file)};self.save()
        with self.assertRaisesRegex(ArtifactError,'Индекс весов'):self.verify()


if __name__=='__main__':unittest.main()
