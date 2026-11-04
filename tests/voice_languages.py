import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'src'))
from voice_languages import language_parts

class Languages(unittest.TestCase):
    def test_languages_and_order(self):
        cases = [
            ('Hello, how are you?', ['en']),
            ('Привет, как дела?', ['ru']),
            ('Проверь Bunker Wars в Jira и Slack.', ['ru','en','ru','en','ru','en']),
            ("Don't stop. I'll check version 2.0.", ['en']),
            ('Версия 2.0: build 42 готов.', ['ru','en','ru']),
            ('123', ['ru']), ('', []),
        ]
        for text, languages in cases:
            parts = language_parts(text)
            self.assertEqual([p[0] for p in parts], languages, text)
            self.assertEqual(''.join(p[1] for p in parts), text)
            for language, segment in parts:
                self.assertNotRegex(segment, '[А-Яа-яЁё]' if language == 'en' else '[A-Za-z]')

if __name__ == '__main__':
    unittest.main()
