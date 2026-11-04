"""Generated Python caches are optional; real sources remain mandatory."""
import importlib.util
import os
from pathlib import Path
import tempfile
import unittest

script = Path(os.environ.get('PETYA_VERIFIER', Path(__file__).resolve().parents[1] / 'scripts/verify-package.py'))
spec = importlib.util.spec_from_file_location('package_verifier', script)
verifier = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verifier)

class PackageVerifierTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.source = Path(self.temp.name) / 'src'
        self.packaged = Path(self.temp.name) / 'packaged'
        for root in [self.source, self.packaged]:
            root.mkdir()
            (root / 'main.cjs').write_text("require('./helper.cjs');")
            (root / 'helper.cjs').write_text('module.exports = 1;')
            (root / 'voice.py').write_text('print("hello")')
    def test_optional_python_cache(self):
        cache = self.source / '__pycache__'
        cache.mkdir()
        (cache / 'voice.cpython-310.pyc').write_bytes(b'cache')
        verifier.verify(self.source, self.packaged)
        cache = self.packaged / '__pycache__'
        cache.mkdir()
        (cache / 'voice.cpython-313.pyc').write_bytes(b'different cache')
        verifier.verify(self.source, self.packaged)
    def test_source_inside_cache_directory_is_not_ignored(self):
        cache = self.source / '__pycache__'
        cache.mkdir()
        (cache / 'real.py').write_text('print("required")')
        with self.assertRaisesRegex(RuntimeError, 'missing=.*real.py'):
            verifier.verify(self.source, self.packaged)
    def test_missing_python_source(self):
        (self.packaged / 'voice.py').unlink()
        with self.assertRaisesRegex(RuntimeError, 'missing=.*voice.py'):
            verifier.verify(self.source, self.packaged)
    def test_changed_source(self):
        (self.packaged / 'helper.cjs').write_text('module.exports = 2;')
        with self.assertRaisesRegex(RuntimeError, 'changed=.*helper.cjs'):
            verifier.verify(self.source, self.packaged)
    def test_extra_source(self):
        (self.packaged / 'unexpected.cjs').write_text('module.exports = 3;')
        with self.assertRaisesRegex(RuntimeError, 'extra=.*unexpected.cjs'):
            verifier.verify(self.source, self.packaged)
    def test_missing_local_import(self):
        for root in [self.source, self.packaged]:
            (root / 'main.cjs').write_text("require('./missing.cjs');")
        with self.assertRaisesRegex(RuntimeError, 'Missing local module'):
            verifier.verify(self.source, self.packaged)

if __name__ == '__main__':
    unittest.main()
