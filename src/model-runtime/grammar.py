"""JSON grammar with an unambiguous terminal whitespace character."""
import json
from outlines_core.json_schema import build_regex_from_schema


def compile_json_grammar(backend,schema):
    # A bare root number can enter a final DFA state before its fractional part.
    # A required newline delays that state without changing the parsed JSON value.
    regex='('+build_regex_from_schema(json.dumps(schema,ensure_ascii=False))+r')\n'
    return backend.get_regex_logits_processor(regex)
