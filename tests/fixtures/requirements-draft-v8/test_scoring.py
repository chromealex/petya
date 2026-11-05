"""Protect evaluation against permissive JSON parsing and schema false positives."""
import json
import unittest
from scoring import parse_json, score

class ScoringTests(unittest.TestCase):
    def test_duplicate_keys_are_rejected(self):
        for text in ['{"status":"open","status":"final"}', '{"a":{"x":1,"x":2}}']:
            with self.assertRaises(ValueError): parse_json(text)

    def test_non_json_and_nonfinite_are_rejected(self):
        for text in ['{"value":NaN}', 'prefix {"value":1}', '{"value":1} trailing']:
            with self.assertRaises(ValueError): parse_json(text)

    def test_single_markdown_wrapper_is_accepted(self):
        self.assertEqual(parse_json('```json\n{"a":1}\n```'), {'a': 1})

    def test_missing_summary_and_object_question_are_rejected(self):
        expected = {'summary':'Задача','description':'Текст','questions':['Какой цвет?']}
        row = {'task':'draft','messages':[{'content':json.dumps(expected)}]}
        for actual in [dict(description='Текст',questions=[]),dict(expected,questions=[{'text':'Цвет'}])]:
            self.assertFalse(score(row,json.dumps(actual))['schemaValid'])
        self.assertTrue(score(row,json.dumps(expected))['exactJSON'])

    def test_boolean_is_not_a_number(self):
        expected = dict(status='final',lower=1,upper=None,lowerInclusive=True,upperInclusive=None)
        row = {'task':'bounds','messages':[{'content':json.dumps(expected)}]}
        self.assertFalse(score(row,json.dumps(dict(expected,lower=True)))['exactJSON'])
        self.assertFalse(score(row,json.dumps(dict(expected,lowerInclusive=1)))['schemaValid'])

if __name__ == '__main__': unittest.main()
