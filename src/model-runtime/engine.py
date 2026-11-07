"""Internal serialized generation engine; transport and lifecycle are separate."""
from datetime import datetime, timezone
import json
import threading
import time
from jsonschema import Draft202012Validator
from contract import RequestError, normalize_chat, parse_json
from artifacts import verify_bundle


class GenerationError(RuntimeError):
    pass


class GenerationBusy(GenerationError):
    pass


class GenerationCancelled(GenerationError):
    pass


def validate_schema(schema):
    if schema is None:
        return None
    if len(json.dumps(schema, ensure_ascii=False)) > 65536:
        raise RequestError('Схема ответа слишком большая.')
    def walk(value, depth=0):
        if depth > 64:
            raise RequestError('Схема ответа слишком глубоко вложена.')
        if isinstance(value, dict):
            for key, child in value.items():
                if key in ('$ref', '$dynamicRef', '$recursiveRef') and (not isinstance(child, str) or not child.startswith('#')):
                    raise RequestError('Внешние ссылки в схеме ответа не поддерживаются.')
                walk(child, depth+1)
        elif isinstance(value, list):
            for child in value:
                walk(child, depth+1)
    walk(schema)
    try:
        Draft202012Validator.check_schema(schema)
        return Draft202012Validator(schema)
    except Exception as error:
        raise RequestError('Некорректная схема ответа.') from error


class MLXBackend:
    def __init__(self, model, tokenizer):
        from outlines.models.mlxlm import MLXLM
        from outlines.backends.outlines_core import OutlinesCoreBackend
        self.model, self.tokenizer = model, tokenizer
        self.vocab_size = max(tokenizer.get_vocab().values()) + 1
        self.grammar = OutlinesCoreBackend(MLXLM(model, tokenizer))

    def prompt(self, messages):
        return self.tokenizer.apply_chat_template(messages, tokenize=True, add_generation_prompt=True, enable_thinking=False)

    def compile(self, schema):
        from grammar import compile_json_grammar
        return compile_json_grammar(self.grammar, schema)

    def generate(self, prompt, settings, grammar, seed):
        import mlx.core as mx
        from mlx_lm import stream_generate
        from mlx_lm.sample_utils import make_sampler, make_logits_processors
        if settings['sampler']['top_k'] > self.vocab_size:
            raise RequestError('top_k превышает размер словаря модели.')
        if seed is not None:
            mx.random.seed(seed)
        processors = make_logits_processors(**settings['penalties'])
        if grammar is not None:
            processors.append(grammar)
        return stream_generate(self.model, self.tokenizer, prompt=prompt,
            sampler=make_sampler(**settings['sampler']), logits_processors=processors,
            max_tokens=settings['max_tokens'])


def load_engine(manifest, base, adapter, expected_digest, progress=None):
    identity = verify_bundle(manifest, base, adapter, expected_digest, progress)
    if progress:progress({'phase':'loading'})
    from mlx_lm import load
    model, tokenizer = load(str(identity.base), adapter_path=str(identity.adapter), lazy=False,
        trust_remote_code=False, tokenizer_config={'trust_remote_code':False, 'local_files_only':True})
    # All arrays must be materialized before the second on-disk identity check.
    import mlx.core as mx
    mx.eval(model.parameters())
    after = verify_bundle(manifest, base, adapter, expected_digest)
    if after != identity:
        raise GenerationError('Файлы модели изменились при загрузке.')
    return GenerationEngine(identity, MLXBackend(model, tokenizer))


class GenerationEngine:
    def __init__(self, identity, backend):
        self.identity, self.backend = identity, backend
        self.lock = threading.Lock()

    def stream(self, body, cancel=None):
        request = normalize_chat(body, self.identity.name)
        validator = validate_schema(request.schema)
        if not self.lock.acquire(blocking=False):
            raise GenerationBusy('Модель занята другим запросом.')
        generator = None
        def check_cancel():
            if cancel is not None and cancel.is_set():
                raise GenerationCancelled('Генерация отменена.')
        try:
            check_cancel()
            prompt = self.backend.prompt(request.messages)
            request.check_context(len(prompt))
            try:
                grammar = self.backend.compile(request.schema) if request.schema is not None else None
            except Exception as error:
                raise RequestError('Схема ответа не поддерживается генератором.') from error
            check_cancel()
            started = time.monotonic_ns()
            generator = self.backend.generate(prompt, request.generation_settings(), grammar, request.seed)
            pieces = []
            last = None
            for response in generator:
                check_cancel()
                last = response
                pieces.append(response.text)
                if response.text:
                    yield {'model':request.model,'created_at':datetime.now(timezone.utc).isoformat(),
                           'message':{'role':'assistant','content':response.text},'done':False}
            check_cancel()
            text = ''.join(pieces)
            if last is None or not text.strip():
                raise GenerationError('Модель вернула пустой ответ.')
            if last.finish_reason not in ('stop', 'length'):
                raise GenerationError('Поток модели завершился без причины окончания.')
            if validator is not None:
                try:
                    validator.validate(parse_json(text))
                except Exception as error:
                    raise GenerationError('Ответ модели не соответствует запрошенной схеме JSON.') from error
            yield {'model':request.model,'created_at':datetime.now(timezone.utc).isoformat(),
                   'message':{'role':'assistant','content':''},'done':True,
                   'done_reason':last.finish_reason,'prompt_eval_count':last.prompt_tokens,
                   'eval_count':last.generation_tokens,'total_duration':time.monotonic_ns()-started}
        finally:
            try:
                if generator is not None and hasattr(generator, 'close'):
                    generator.close()
            finally:
                self.lock.release()

    def complete(self, body, cancel=None):
        content=[]
        final=None
        for chunk in self.stream(body,cancel):
            if chunk['done']:
                final=chunk
            else:
                content.append(chunk['message']['content'])
        if final is None:
            raise GenerationError('Не получено завершение ответа.')
        return {**final,'message':{'role':'assistant','content':''.join(content)}}
