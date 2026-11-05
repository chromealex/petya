"""Strict output structure and exact constrained-answer scoring."""
import json
import re

def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f'Duplicate key: {key}')
        result[key] = value
    return result

def parse_json(text):
    text = text.strip()
    match = re.fullmatch(r'```(?:json)?\s*\n?(.*?)\n?```', text, re.S)
    if match:
        text = match.group(1)
    def reject_constant(value):
        raise ValueError(f'Non-finite JSON number: {value}')
    return json.loads(text, object_pairs_hook=unique_object, parse_constant=reject_constant)

def score(row, answer):
    try:
        expected = json.loads(row['messages'][-1]['content'])
    except ValueError:
        return {'exactJSON': answer.strip() in row.get('accepted', [row['messages'][-1]['content']]), 'schemaValid': True}
    try:
        actual = parse_json(answer)
    except ValueError as exc:
        return {'exactJSON': False, 'schemaValid': False, 'parseError': str(exc)}
    valid = True
    if row['task'] == 'draft':
        valid = (type(actual) is dict and set(actual) == {'summary', 'description', 'questions'}
                 and all(type(actual[k]) is str and actual[k].strip() for k in ['summary', 'description'])
                 and type(actual['questions']) is list
                 and all(type(q) is str and q.strip() for q in actual['questions']))
    elif row['task'] == 'bounds':
        valid = (type(actual) is dict and set(actual) == set(expected)
                 and actual['status'] in ['open', 'final']
                 and all(actual[k] is None or type(actual[k]) in [int, float] for k in ['lower', 'upper'])
                 and all(actual[k] is None or type(actual[k]) is bool for k in ['lowerInclusive', 'upperInclusive']))
    exact = valid and type(actual) is type(expected) and actual == expected
    if exact and row['task'] == 'bounds':
        exact = all(type(actual[k]) is type(v) for k, v in expected.items())
    return {'exactJSON': bool(exact), 'schemaValid': bool(valid)}
