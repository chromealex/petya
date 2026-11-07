"""CPU-only tokenizer/JSON grammar feasibility; no model weights or inference."""
import argparse
import hashlib
import importlib.metadata
import json
import sys
from pathlib import Path
from transformers import AutoTokenizer
from outlines.models.mlxlm import MLXLM
from outlines.backends.outlines_core import OutlinesCoreBackend
from outlines_core import Guide
sys.path.insert(0, str(Path(__file__).resolve().parents[3] / 'src' / 'model-runtime'))
from grammar import compile_json_grammar

p = argparse.ArgumentParser()
p.add_argument('base', type=Path)
p.add_argument('schema', type=Path)
p.add_argument('output', type=Path)
p.add_argument('--raw', action='store_true', help='Reproduce the uncorrected upstream grammar failure')
a = p.parse_args()
assert not a.output.exists(), 'Preserve earlier evidence'
tok = AutoTokenizer.from_pretrained(a.base, local_files_only=True)
backend = OutlinesCoreBackend(MLXLM(None, tok))
checks = []


def compile_schema(schema):
    if not a.raw:
        return compile_json_grammar(backend, json.loads(schema))
    return backend.get_json_schema_logits_processor(schema)


def check(name, processor, text, expected):
    if not a.raw: text += '\n'
    tokens = tok.encode(text, add_special_tokens=False)
    guide = Guide(processor.index)
    accepted = guide.accepts_tokens(tokens)
    finished = False
    eos_allowed = False
    if accepted:
        for token in tokens:
            guide.advance(token, return_tokens=False)
        finished = guide.is_finished()
        eos_allowed = tok.eos_token_id in guide.get_tokens()
    diagnostic = None
    if expected and not (accepted and finished and eos_allowed):
        probe = Guide(processor.index)
        diagnostic = []
        for token in tokens:
            allowed = token in probe.get_tokens()
            diagnostic.append({'token': token, 'text': tok.decode([token]), 'allowed': allowed})
            if not allowed: break
            probe.advance(token, return_tokens=False)
        diagnostic.append({'finished': probe.is_finished(), 'eos_allowed': tok.eos_token_id in probe.get_tokens()})
    actual = bool(accepted and finished and eos_allowed)
    checks.append(dict(name=name, text=text, expected=expected, accepted_complete=actual,
                       finished=finished, eos_allowed=eos_allowed, diagnostic=diagnostic, passed=actual == expected))


processor = compile_schema(a.schema.read_text())
for name, value, expected in [
    ('unicode-label', {'understood': True, 'answer': 'Счёт_QA-0046: -48 < x ≤ -12.', 'clarificationOptions': []}, True),
    ('two-choices', {'understood': True, 'answer': 'Кому отправить?', 'clarificationOptions': ['Мастеру', 'Ученику']}, True),
    ('optional-omitted', {'understood': True, 'answer': 'Готово.'}, True),
    ('false-boolean', {'understood': False, 'answer': 'Уточни вопрос.'}, True),
    ('wrong-type', {'understood': 'yes', 'answer': 'bad'}, False),
    ('extra-property', {'understood': True, 'answer': 'ok', 'extra': 'bad'}, False),
    ('five-choices', {'understood': True, 'answer': 'Выбери.', 'clarificationOptions': ['А', 'Б', 'В', 'Г', 'Д']}, False),
    ('missing-answer', {'understood': True}, False),
]:
    check(name, processor, json.dumps(value, ensure_ascii=False, separators=(',', ':')), expected)
check('duplicate-key', processor, '{"understood":true,"answer":"a","answer":"b"}', False)
check('truncated-json', processor, '{"understood":true,"answer":"abc', False)
# The application also sends format="json" without a field-specific schema.
generic = compile_schema('{"type":"object"}')
check('generic-object', generic, '{"description":"Код только для посылки","questions":[],"summary":"Код"}', True)
check('generic-array-rejected', generic, '[1,2]', False)
# Empty schema is the runtime contract for format="json": every JSON value is allowed.
any_json = compile_schema('{}')
for name, text, expected in [
    ('any-object', '{"код":"Счёт_QA-0046","граница":-48}', True),
    ('any-array', '[-63,-37,-14,-14]', True),
    ('any-string', '"Привет"', True),
    ('any-number', '-48.25', True),
    ('any-boolean', 'true', True),
    ('any-null', 'null', True),
    ('any-truncated', '{"код":', False),
    ('any-nonfinite', 'NaN', False),
]:
    check(name, any_json, text, expected)
number_only = compile_schema('{"type":"number"}')
check('number-schema', number_only, '-48.25', True)
explicit_any = compile_schema(json.dumps({'anyOf': [{'type': kind} for kind in ['object','array','string','number','boolean','null']]}))
check('explicit-any-number', explicit_any, '-48.25', True)
check('explicit-any-array', explicit_any, '[-63,-37,-14,-14]', True)
check('explicit-any-object', explicit_any, '{"число":-48.25}', True)
result = dict(scope='CPU grammar/tokenizer feasibility only; no model weights loaded or GPU generation performed.',
              base=str(a.base), base_revision=a.base.name, terminated=not a.raw,
              schema_sha256=hashlib.sha256(a.schema.read_bytes()).hexdigest(),
              tokenizer_sha256=hashlib.sha256((a.base / 'tokenizer.json').read_bytes()).hexdigest(),
              vocabulary_size=len(tok.get_vocab()), checks=checks,
              versions={name: importlib.metadata.version(name) for name in ['outlines', 'outlines_core', 'mlx-lm', 'transformers']},
              eos_note='Guide.accepts_tokens checks grammar text. After complete text, is_finished and get_tokens authorize EOS; do not append EOS to accepts_tokens.')
a.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
assert all(c['passed'] for c in checks), [(c['name'], c['accepted_complete']) for c in checks if not c['passed']]
print('Passed', len(checks), 'CPU-only grammar checks; runtime generation remains unverified.')
