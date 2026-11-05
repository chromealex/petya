import sys,tempfile,unittest,shutil
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'src'))
from voice_language import detect_languages,missing_languages,installed,load_numbers
from voice_numbers import spoken_numbers
import num2words
class LanguagePacks(unittest.TestCase):
 def test_detection_and_optional_install(self):
  cases={'Guten Morgen. Ich möchte über das Projekt sprechen.':'de','Bonjour, nous avons douze tâches dans le projet.':'fr','Hola, tenemos doce tareas en este proyecto.':'es','Buongiorno, abbiamo dodici attività nel progetto.':'it','Olá, temos doze tarefas neste projeto.':'pt','こんにちは、プロジェクトには十二のタスクがあります。':'ja','안녕하세요 프로젝트에 열두 개의 작업이 있습니다.':'ko'}
  with tempfile.TemporaryDirectory() as directory:
   for text,code in cases.items():
    self.assertEqual(detect_languages(text),[code]);self.assertEqual(missing_languages(text,directory)[0]['code'],code)
    target=Path(directory)/code;target.mkdir();shutil.copy(Path(num2words.__file__).parent/('lang_'+code.upper()+'.py'),target/'numbers.py')
    self.assertTrue(installed(code,directory));load_numbers(code,directory);self.assertEqual(missing_languages(text,directory),[])
    self.assertNotRegex(spoken_numbers('12',code),r'\d')
   self.assertEqual(detect_languages('Проверь Bunker Wars в Jira. Please check Slack.'),['ru','en'])
   self.assertEqual(detect_languages('Bunker Wars'),['en'])
   # a Slack window title inside a Russian answer is not German
   self.assertEqual(detect_languages('Прочитал Экран Slack · jw-random (Channel) - Azur Games - 1 new item - Slack (53 символов).'),['ru'])
   self.assertEqual(detect_languages('Привет! Переведи: Guten Morgen, wie geht es dir heute, mein lieber Freund?'),['ru','de'])
   self.assertEqual(detect_languages('日本語', 'ja'),['ja'])
   self.assertEqual(detect_languages('你好世界'),['zh-cn'])
   self.assertEqual(detect_languages('Привет! こんにちは。 안녕하세요.'),['ru','ja','ko'])
   (Path(directory)/'de/numbers.py').write_text('corrupt');self.assertFalse(installed('de',directory))
if __name__=='__main__':unittest.main()
