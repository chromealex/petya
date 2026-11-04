import sys,tempfile,unittest,shutil
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'src'))
from voice_language import detect_languages,missing_languages,installed,load_numbers
from voice_numbers import spoken_numbers
import num2words
class LanguagePacks(unittest.TestCase):
 def test_detection_and_optional_install(self):
  cases={'Guten Morgen. Ich möchte über das Projekt sprechen.':'de','Bonjour, nous avons douze tâches dans le projet.':'fr','Hola, tenemos doce tareas en este proyecto.':'es'}
  with tempfile.TemporaryDirectory() as directory:
   for text,code in cases.items():
    self.assertEqual(detect_languages(text),[code]);self.assertEqual(missing_languages(text,directory)[0]['code'],code)
    target=Path(directory)/code;target.mkdir();shutil.copy(Path(num2words.__file__).parent/('lang_'+code.upper()+'.py'),target/'numbers.py')
    self.assertTrue(installed(code,directory));load_numbers(code,directory);self.assertEqual(missing_languages(text,directory),[])
    self.assertNotRegex(spoken_numbers('12',code),r'\d')
   self.assertEqual(detect_languages('Проверь Bunker Wars в Jira. Please check Slack.'),['ru','en'])
   self.assertEqual(detect_languages('Bunker Wars'),['en'])
   (Path(directory)/'de/numbers.py').write_text('corrupt');self.assertFalse(installed('de',directory))
if __name__=='__main__':unittest.main()
