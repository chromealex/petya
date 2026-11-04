"""Expand numeric tokens before synthesis; never change the displayed answer."""
import re
import json
from pathlib import Path
_CATALOG=json.loads(Path(__file__).with_name('language-catalog.json').read_text())
from num2words import num2words


def spoken_numbers(text, language='ru'):
    text = re.sub(r'(?<![\w])[-−](?=\d)', ('минус' if language == 'ru' else _CATALOG.get(language,{}).get('minus','minus'))+' ', text)
    point = ' '+('точка' if language == 'ru' else _CATALOG.get(language,{}).get('point','point'))+' '
    digits = lambda value: ' '.join(num2words(int(c), lang=language) for c in value)
    def integer(value):
        return digits(value) if len(value) > 1 and value.startswith('0') or len(value) > 15 else num2words(int(value), lang=language)
    # Spaces grouping thousands are numeric separators, not separate counts.
    text = re.sub(r'(?<!\d)\d{1,3}(?:[ \u00a0\u202f]\d{3})+(?!\d)', lambda m: re.sub(r'\s', '', m[0]), text)
    # Explicit versions, plus unambiguous multi-dot versions, retain every component.
    text = re.sub(r'((?:верси[яиюи]|version|release)\s+)(\d+(?:\.\d+)+)', lambda m: m[1] + point.join(integer(v) for v in m[2].split('.')), text, flags=re.I)
    text = re.sub(r'\d+(?:\.\d+){2,}', lambda m: point.join(integer(v) for v in m[0].split('.')), text)
    def number(match):
        value = match[0]
        if '.' in value or ',' in value:
            whole, fraction = re.split('[.,]', value)
            return integer(whole) + point + digits(fraction)
        return integer(value)
    text = re.sub(r'\d+(?:[.,]\d+)?', number, text)
    return text.replace('%', ' '+('процентов' if language == 'ru' else _CATALOG.get(language,{}).get('percent','percent')))
