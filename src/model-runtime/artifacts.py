"""Verify local model bytes against an explicitly pinned manifest before loading."""
from dataclasses import dataclass
import hashlib
import json
from pathlib import Path
import re
from contract import parse_json


class ArtifactError(ValueError):
    pass


def sha256_file(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as stream:
        before = stream.fileno()
        import os
        initial = os.fstat(before)
        while block := stream.read(8 * 1024 * 1024):
            digest.update(block)
        final = os.fstat(before)
    if (initial.st_size, initial.st_mtime_ns) != (final.st_size, final.st_mtime_ns):
        raise ArtifactError('Файл модели изменился во время проверки.')
    return digest.hexdigest()


def manifest_digest(manifest):
    canonical = json.dumps(manifest, sort_keys=True, ensure_ascii=False, separators=(',', ':'), allow_nan=False)
    return hashlib.sha256(canonical.encode()).hexdigest()


def require(condition, message):
    if not condition:
        raise ArtifactError(message)


def validate_entries(files):
    require(type(files) is dict and bool(files), 'Нет списка файлов модели.')
    for name, entry in files.items():
        require(type(name) is str and bool(re.fullmatch(r'[A-Za-z0-9_.-]+', name)) and name not in ('.', '..'), 'Небезопасное имя файла модели.')
        require(type(entry) is dict and set(entry) == {'sha256', 'bytes'}, 'Неверное описание файла модели.')
        require(type(entry['sha256']) is str and bool(re.fullmatch('[a-f0-9]{64}', entry['sha256'])), 'Неверный хеш файла модели.')
        require(type(entry['bytes']) is int and entry['bytes'] >= 0, 'Неверный размер файла модели.')
    return sum(x['bytes'] for x in files.values())


def verify_files(directory, files, progress=None):
    total = validate_entries(files)
    require(directory.is_dir(), 'Папка модели недоступна.')
    # Model loaders discover auxiliary tokenizer/config files and weight shards.
    # Reject extras instead of hashing only the files we happen to expect.
    extras = {p.name for p in directory.iterdir()} - set(files) - {'README.md', 'LICENSE', '.gitattributes'}
    require(not extras, 'Незаявленные файлы в папке модели: ' + ', '.join(sorted(extras)))
    verified = 0
    for name, entry in sorted(files.items()):
        file = directory / name
        require(file.is_file(), 'Не найден файл модели: ' + name)
        require(file.stat().st_size == entry['bytes'], 'Размер файла модели не совпадает: ' + name)
        require(sha256_file(file) == entry['sha256'], 'Хеш файла модели не совпадает: ' + name)
        verified += entry['bytes']
        if progress:
            progress({'phase': 'verifying', 'file': name, 'verified_bytes': verified, 'total_bytes': total})
    return total


@dataclass(frozen=True)
class ArtifactIdentity:
    name: str
    digest: str
    base: Path
    adapter: Path
    size: int
    qualification: str


def verify_bundle(manifest_path, base, adapter, expected_digest, progress=None):
    manifest = parse_json(Path(manifest_path).read_bytes())
    require(type(manifest) is dict and set(manifest) == {'format_version', 'name', 'qualification', 'base', 'adapter'}, 'Неверный манифест модели.')
    require(type(manifest['format_version']) is int and manifest['format_version'] == 1, 'Неподдерживаемая версия манифеста.')
    require(type(expected_digest) is str and bool(re.fullmatch('[a-f0-9]{64}', expected_digest)), 'Нужен ожидаемый хеш манифеста.')
    require(manifest_digest(manifest) == expected_digest, 'Манифест не соответствует выбранной модели.')
    require(type(manifest['name']) is str and bool(re.fullmatch('[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}', manifest['name'])), 'Неверное имя модели.')
    require(manifest['qualification'] in ('development', 'release'), 'Не указан этап подготовки модели.')
    base_info, adapter_info = manifest['base'], manifest['adapter']
    require(type(base_info) is dict and set(base_info) == {'repository', 'revision', 'files'}, 'Неверное описание базовой модели.')
    require(type(adapter_info) is dict and set(adapter_info) == {'files'}, 'Неверное описание адаптера.')
    require(type(base_info['repository']) is str and bool(base_info['repository']), 'Не указан источник базовой модели.')
    require(type(base_info['revision']) is str and bool(re.fullmatch('[a-f0-9]{40}', base_info['revision'])), 'Не зафиксирована ревизия базовой модели.')
    base, adapter = Path(base), Path(adapter)
    total = validate_entries(base_info['files']) + validate_entries(adapter_info['files'])
    def reporting(group, offset):
        if progress is None:
            return None
        return lambda event: progress({**event, 'group': group, 'verified_bytes': offset + event['verified_bytes'], 'total_bytes': total})
    base_size = verify_files(base, base_info['files'], reporting('base', 0))
    adapter_size = verify_files(adapter, adapter_info['files'], reporting('adapter', base_size))
    require({'config.json', 'tokenizer.json', 'tokenizer_config.json', 'chat_template.jinja', 'model.safetensors.index.json'} <= set(base_info['files']), 'Не хватает файлов базовой модели.')
    require({'adapters.safetensors', 'adapter_config.json'} <= set(adapter_info['files']), 'Не хватает файлов адаптера.')
    index = parse_json((base / 'model.safetensors.index.json').read_bytes())
    require(type(index) is dict and type(index.get('weight_map')) is dict and bool(index['weight_map']), 'Неверный индекс весов.')
    require(all(type(s) is str for s in index['weight_map'].values()), 'Неверные ссылки на файлы весов.')
    shards = set(index['weight_map'].values())
    require(shards == {n for n in base_info['files'] if n.endswith('.safetensors')}, 'Индекс весов ссылается на другой набор файлов.')
    config = parse_json((adapter / 'adapter_config.json').read_bytes())
    require(type(config) is dict and config.get('model') == base_info['repository'] and config.get('revision') == base_info['revision'], 'Адаптер предназначен для другой базовой модели.')
    return ArtifactIdentity(manifest['name'], expected_digest, base.resolve(), adapter.resolve(), base_size + adapter_size, manifest['qualification'])
