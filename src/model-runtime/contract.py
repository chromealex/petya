"""Shared validated request contract for Petya's in-development local runtime."""
from dataclasses import dataclass
import json
import math


class RequestError(ValueError):
    """A caller can correct the request without restarting the model."""


def parse_json(raw):
    def unique(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise RequestError('Повторяющееся поле JSON: ' + key)
            result[key] = value
        return result
    def constant(value):
        raise RequestError('Недопустимое число JSON: ' + value)
    try:
        value = json.loads(raw, object_pairs_hook=unique, parse_constant=constant)
        json.dumps(value, allow_nan=False)
        return value
    except (ValueError, TypeError, UnicodeError, RecursionError) as error:
        raise RequestError('Некорректный JSON запроса.') from error


def number(value, name, minimum, maximum, integer=False):
    if type(value) not in ([int] if integer else [int, float]):
        raise RequestError('Неверный тип параметра: ' + name)
    if not minimum <= value <= maximum or type(value) is float and not math.isfinite(value):
        raise RequestError('Параметр вне допустимого диапазона: ' + name)
    return value


@dataclass(frozen=True)
class ChatRequest:
    model: str
    messages: list
    stream: bool
    schema: dict | None
    temperature: float
    top_p: float
    top_k: int
    repeat_penalty: float
    repeat_last_n: int
    max_tokens: int
    context_tokens: int
    seed: int | None

    def generation_settings(self):
        return {
            'sampler': {'temp': self.temperature, 'top_p': self.top_p, 'top_k': self.top_k},
            'penalties': {'repetition_penalty': self.repeat_penalty if self.repeat_last_n else None,
                          'repetition_context_size': self.repeat_last_n},
            'max_tokens': self.max_tokens,
        }

    def check_context(self, prompt_tokens):
        if type(prompt_tokens) is not int or prompt_tokens < 0:
            raise RequestError('Не удалось определить длину контекста.')
        if prompt_tokens + self.max_tokens > self.context_tokens:
            raise RequestError('Диалог и ответ превышают выбранный размер контекста. Сократи запрос или увеличь num_ctx.')


def normalize_chat(body, model_name, max_context=32768, max_output=8192):
    if type(body) is not dict:
        raise RequestError('Запрос должен быть объектом JSON.')
    unknown = set(body) - {'model', 'messages', 'stream', 'format', 'options', 'think'}
    if unknown:
        raise RequestError('Неподдерживаемые поля запроса: ' + ', '.join(sorted(unknown)))
    if body.get('model') != model_name:
        raise RequestError('Эта модель не загружена в сервис.')
    messages = body.get('messages')
    if type(messages) is not list or not 1 <= len(messages) <= 512:
        raise RequestError('Нужен непустой список сообщений, не более 512.')
    clean = []
    for message in messages:
        if type(message) is not dict or set(message) != {'role', 'content'}:
            raise RequestError('Поддерживаются только текстовые сообщения role/content.')
        if message['role'] not in ('system', 'user', 'assistant') or type(message['content']) is not str:
            raise RequestError('Недопустимая роль или содержимое сообщения.')
        clean.append(dict(message))
    if sum(len(x['content']) for x in clean) > 262144:
        raise RequestError('Текст запроса слишком большой.')
    stream = body.get('stream', True)
    if type(stream) is not bool:
        raise RequestError('stream должен быть логическим значением.')
    if body.get('think', False) is not False:
        raise RequestError('Этот режим сервиса пока поддерживает только think=false.')
    output_format = body.get('format')
    if output_format is None or output_format == '':
        schema = None
    elif output_format == 'json':
        schema = {}
    elif type(output_format) is dict:
        try:
            schema = parse_json(json.dumps(output_format, allow_nan=False))
        except (ValueError, TypeError, RecursionError) as error:
            raise RequestError('Некорректная схема ответа.') from error
    else:
        raise RequestError('format должен быть json или объектом JSON Schema.')
    options = body.get('options', {})
    if type(options) is not dict:
        raise RequestError('options должен быть объектом JSON.')
    allowed = {'temperature', 'top_p', 'top_k', 'repeat_penalty', 'repeat_last_n', 'num_predict', 'num_ctx', 'seed'}
    if set(options) - allowed:
        raise RequestError('Неподдерживаемые параметры генерации: ' + ', '.join(sorted(set(options) - allowed)))
    context = number(options.get('num_ctx', min(16384, max_context)), 'num_ctx', 1, max_context, True)
    tokens = number(options.get('num_predict', min(2048, max_output)), 'num_predict', 1, max_output, True)
    result = ChatRequest(model_name, clean, stream, schema,
        number(options.get('temperature', 0.6), 'temperature', 0, 2),
        number(options.get('top_p', 0.9), 'top_p', 0, 1),
        number(options.get('top_k', 40), 'top_k', 0, 1000000, True),
        number(options.get('repeat_penalty', 1.1), 'repeat_penalty', 0.01, 10),
        number(options.get('repeat_last_n', min(64, context)), 'repeat_last_n', 0, context, True),
        tokens, context, None if 'seed' not in options else number(options['seed'], 'seed', 0, 4294967295, True))
    result.check_context(0)
    return result
