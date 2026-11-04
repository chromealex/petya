import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'src'))
from voice_numbers import spoken_numbers

class SpokenNumbers(unittest.TestCase):
    def test_counts_and_versions(self):
        cases = {
            '0 багов, 12 задач, 3 открытых': 'ноль багов, двенадцать задач, три открытых',
            'Версия 1.19.0': 'Версия один точка девятнадцать точка ноль',
            'версия 2.0': 'версия два точка ноль',
            '1 234 задачи': 'одна тысяча двести тридцать четыре задачи',
            'Код 007': 'Код ноль ноль семь',
            '25%': 'двадцать пять процентов',
            '0,05': 'ноль точка ноль пять',
        }
        for value, expected in cases.items():
            self.assertEqual(spoken_numbers(value), expected)
        self.assertEqual(spoken_numbers('Version 1.19.0: 12 tasks, 3 open.', 'en'), 'Version one point nineteen point zero: twelve tasks, three open.')
        self.assertEqual(spoken_numbers('12345678901234567890').count(' '), 19)
        self.assertEqual(spoken_numbers('Нет задач.'), 'Нет задач.')

if __name__ == '__main__': unittest.main()
