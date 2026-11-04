"""Split Cyrillic/Latin speech without dropping words, numbers or punctuation."""
import re


def language_parts(text):
    parts = []
    language = None
    start = 0
    for match in re.finditer(r'[A-Za-z]+|[А-Яа-яЁё]+', text):
        current = 'en' if match[0][0].isascii() else 'ru'
        if language is not None and current != language:
            parts.append((language, text[start:match.start()]))
            start = match.start()
        language = current
    if text:
        parts.append((language or 'ru', text[start:]))
    return parts
