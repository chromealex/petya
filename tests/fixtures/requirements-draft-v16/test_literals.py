"""Guard exact-label grading against silent normalization and prefix matches."""
import unittest
from literal_check import missing_literals,assess
class LiteralTests(unittest.TestCase):
    def test_exact_labels_accept_normal_prose(self):
        self.assertEqual(missing_literals('Переименовать «Пропуска-07» в «Допуски-07».',['Пропуска-07','Допуски-07']),[])
    def test_inflection_and_zero_are_not_equivalent(self):
        for text in ['Пропуски-07','Пропуска-7','Пропуска-070','XПропуска-07','Пропуска-07_архив']:
            self.assertEqual(missing_literals(text,['Пропуска-07']),['Пропуска-07'])
    def test_case_and_yo_are_preserved(self):
        self.assertEqual(missing_literals('Счеты-04, счёты-04',['Счёты-04']),['Счёты-04'])
    def test_unicode_equivalent_forms_are_accepted(self):
        self.assertEqual(missing_literals('Сче\u0308ты-04',['Счёты-04']),[])
    def test_title_alone_does_not_satisfy_description(self):
        row={'required_literals':['Пропуска-07']}
        self.assertFalse(assess(row,'{"summary":"Пропуска-07","description":"Переименовать раздел","questions":[]}')['passed'])
    def test_duplicate_json_keys_are_not_credited(self):
        self.assertFalse(assess({'required_literals':['Акты-04']},'{"description":"wrong","description":"Акты-04"}')['passed'])
if __name__=='__main__':unittest.main()
