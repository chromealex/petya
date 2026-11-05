"""Detect language and load only explicitly installed pronunciation resources."""
import hashlib
import importlib.util
import json
import re
from pathlib import Path
from langdetect import detect_langs, DetectorFactory
DetectorFactory.seed = 0
CATALOG = json.loads(Path(__file__).with_name('language-catalog.json').read_text())


def detect_languages(text, preferred='ru'):
    found = []
    def add(code):
        if code not in found: found.append(code)
    if re.search('[А-Яа-яЁё]', text): add('ru')
    if re.search('[\u3040-\u30ff]', text): add('ja')
    if re.search('[\uac00-\ud7af\u1100-\u11ff]', text): add('ko')
    if re.search('[\u4e00-\u9fff]', text) and not any(code in found for code in ('ja','ko')):
        add('ja' if preferred=='ja' else 'zh-cn')
    for segment in re.findall(r'[A-Za-zÀ-ž][A-Za-zÀ-ž\s\d,\'’:%-]*', text):
        value = segment.strip()
        greetings = {'bonjour':'fr', 'guten morgen':'de', 'buenos días':'es', 'hola':'es', 'ciao':'it', 'buongiorno':'it', 'olá':'pt', 'bom dia':'pt'}
        greeting = re.split(r'[,!?:]', value.lower(), maxsplit=1)[0].strip()
        if greeting in greetings:
            add(greetings[greeting]); continue
        words = re.findall(r'[A-Za-zÀ-ž]+', value)
        if len(words) < 3:
            continue  # Project names alone must not trigger installation.
        # Inside a Russian answer, short Latin runs are names and window titles («Azur Games - 1 new item - Slack»),
        # not a phrase to pronounce in another language: only a real sentence counts, and only with high confidence.
        short = 'ru' in found and (len(words) < 6 or sum(map(len, words)) < 30)
        try:
            result = detect_langs(value)[0]
            # English is built in; any other language from a short run needs a real sentence and high confidence.
            if result.lang == 'en' and result.prob >= .90: add('en')
            elif not short and result.prob >= (.97 if len(words) < 8 else .90): add(result.lang)
        except Exception: pass
    if not found: add(preferred if preferred in ['ru','en',*CATALOG] and preferred!='ru' else 'en' if re.search('[A-Za-z]',text) else 'ru')
    return found


def installed(code, directory):
    if code in ('ru','en'): return True
    item = CATALOG.get(code)
    if not item: return False
    target = Path(directory) / code / 'numbers.py'
    return target.is_file() and hashlib.sha256(target.read_bytes()).hexdigest() == item['sha256']


def missing_languages(text, directory, preferred='ru'):
    return [{'code':code,'label':CATALOG.get(code,{}).get('label',code),'available':code in CATALOG}
            for code in detect_languages(text,preferred) if not installed(code,directory)]


def load_numbers(code, directory):
    if code in ('ru','en'): return
    if not installed(code,directory): raise ValueError('Language pack is not installed')
    import num2words
    spec=importlib.util.spec_from_file_location('num2words.petya_'+code, Path(directory)/code/'numbers.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    num2words.CONVERTER_CLASSES[code]=getattr(module,'Num2Word_'+CATALOG[code]['module'])()

if __name__ == '__main__':
    import sys
    request=json.load(sys.stdin)
    print(json.dumps({'missing':missing_languages(request['text'],sys.argv[1],request.get('preferred','ru'))}))
