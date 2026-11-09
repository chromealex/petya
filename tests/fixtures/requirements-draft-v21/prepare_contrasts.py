"""Author balanced decision contrasts; these rows are training-only evidence."""
import hashlib
import itertools
import json
from pathlib import Path

R = Path(__file__).resolve().parent
P = R.parent / 'requirements-draft-v20'
prior = [json.loads(line) for line in (P / 'acquisition.jsonl').read_text().splitlines()]
SYSTEM = next(row['messages'][0]['content'] for row in prior if row['task'] == 'draft')
rows = []

def draft(key, turns, description, title, literals=None):
    assert len(turns) == 9
    messages = [{'role': 'system', 'content': SYSTEM}]
    messages += [{'role': 'user' if i % 2 == 0 else 'assistant', 'content': text}
                 for i, text in enumerate(turns)]
    answer = {'summary': title, 'description': description, 'questions': []}
    messages.append({'role': 'assistant', 'content': json.dumps(answer, ensure_ascii=False)})
    row = {'id': 'contrast-' + key, 'task': 'draft', 'messages': messages}
    if literals:
        row['required_literals'] = literals
    rows.append(row)

# Every two-decision family contains all four truth assignments. Later replies
# cannot be inferred from a fixed first/second or allow/deny response pattern.
for context, names in enumerate([
    ('raw_ref', 'checked_ref', 'sender_ref', 'receiver_ref'),
    ('start_code', 'finish_code', 'batch_code', 'lot_code'),
    ('queue_key', 'ticket_key', 'agent_key', 'team_key'),
    ('origin_tag', 'final_tag', 'desk_tag', 'room_tag'),
]):
    a, b, c, d = names
    for first, second in itertools.product([False, True], repeat=2):
        turns = [f'В реестре согласовали две замены: {a} на {b}, {c} на {d}.',
                 'Оставляем обе договорённости?',
                 'Первая замена остаётся.' if first else 'Первую замену отменяю.',
                 'Это решение распространяется на вторую?',
                 'Нет. Вторую выполняем.' if second else 'Нет. Вторую отдельно отменяю.',
                 'Может, сделать наоборот?', 'Не надо менять мои последние решения.',
                 'Нужны ещё поля?', 'Нет. Запиши окончательный состав реестра.']
        desc = (f'Использовать {b} вместо {a}.' if first else f'Сохранить {a}, не заменять его на {b}.')
        desc += ' ' + (f'Использовать {d} вместо {c}.' if second else f'Сохранить {c}, не заменять его на {d}.')
        desc += ' Другие поля не добавлять.'
        draft(f'fields-{context}-{int(first)}{int(second)}', turns, desc, 'Поля реестра', list(names))

for context, (document, recipient, old, new) in enumerate([
    ('ведомость', 'архивариусу', 'номер полки', 'номер ячейки'),
    ('спецификацию', 'конструктору', 'код узла', 'код сборки'),
    ('квитанцию', 'курьеру', 'номер маршрута', 'номер рейса'),
    ('сводку', 'диспетчеру', 'код участка', 'код смены'),
]):
    for replace, send in itertools.product([False, True], repeat=2):
        turns = [f'Подготовить {document}: {old} и дата. {recipient.capitalize()} отправка пока запрещена.',
                 f'Заменить {old} на {new}?',
                 'Да, эту замену подтверждаю.' if replace else 'Нет, прежний реквизит оставить.',
                 'Теперь отправка разрешена?',
                 'Теперь разрешаю отправку этому адресату.' if send else 'Нет, запрет остаётся.',
                 'Дату тоже менять?', 'Нет. Оставить дату как есть.',
                 'Это меняет решение о реквизите?', 'Не меняет. Оформи итог, новых решений не добавляй.']
        desc = f'Подготовить {document}, сохранить дату. '
        desc += f'Использовать {new} вместо {old}. ' if replace else f'Сохранить {old} без замены на {new}. '
        desc += f'{recipient.capitalize()} отправка разрешена.' if send else f'{recipient.capitalize()} не отправлять.'
        draft(f'field-permission-{context}-{int(replace)}{int(send)}', turns, desc, 'Подготовка документа')

for context, (first, second, document) in enumerate([
    ('редактору', 'корректору', 'памятки'), ('механику', 'водителю', 'инструкции'),
    ('заведующему', 'лаборанту', 'схемы'), ('координатору', 'волонтёру', 'описания'),
]):
    for allow_first, allow_second in itertools.product([False, True], repeat=2):
        turns = [f'Две одинаковые {document}: для двух адресатов. {first.capitalize()} и {second} пока не отправлять.',
                 f'Какое решение по первому адресату — {first}?',
                 'Ему отправку разрешаю.' if allow_first else 'Для него запрет сохраняется.',
                 f'А {second}?',
                 'Этому адресату можно отправить.' if allow_second else 'Этому адресату отправку запрещаю.',
                 'Содержание сделать разным?', 'Нет. Обе копии идентичны, без дополнений.',
                 'Нужно изменить разрешения?', 'Нет, последние решения остаются. Оформи задачу.']
        desc = f'Подготовить две одинаковые {document} без дополнений. '
        desc += f'{first.capitalize()} отправка разрешена. ' if allow_first else f'{first.capitalize()} не отправлять. '
        desc += f'{second.capitalize()} отправка разрешена.' if allow_second else f'{second.capitalize()} не отправлять.'
        draft(f'recipients-{context}-{int(allow_first)}{int(allow_second)}', turns, desc, 'Две одинаковые копии')

for context, (old, new, retained) in enumerate([
    ('Сектор', 'Зона', 'Этаж'), ('Кабинет', 'Помещение', 'Корпус'),
    ('Категория', 'Раздел', 'Метка'), ('Маршрут', 'Направление', 'Остановка'),
]):
    for replace in [False, True]:
        turns = [f'В форме поля «{old}» и «{retained}». Нужно поле «{new}».',
                 f'«{new}» заменяет «{old}»?',
                 'Да, это замена.' if replace else 'Нет, это дополнительное поле; старое сохраняем.',
                 f'Убрать «{retained}»?', 'Нет, его оставить.',
                 'Имена привести к сокращениям?', 'Не сокращать, сохранить точное написание.',
                 'Нужны другие изменения?', 'Нет. Составь требования.']
        desc = f'Заменить поле «{old}» полем «{new}». ' if replace else f'Сохранить поле «{old}» и добавить отдельное поле «{new}». '
        desc += f'Сохранить поле «{retained}». Названия не сокращать, другие изменения не добавлять.'
        draft(f'addition-{context}-{int(replace)}', turns, desc, 'Поля формы', [old, new, retained])

for context, (purpose, seconds) in enumerate([
    ('получения пропуска', 215), ('выдачи инструмента', 325),
    ('получения посылки', 145), ('выдачи оборудования', 265),
]):
    for lifetime in [False, True]:
        turns = [f'Код для {purpose} должен применяться один раз. Срок пока не определили.',
                 f'Установить {seconds} секунд?',
                 'Да, этот срок утверждаю.' if lifetime else 'Нет, этот срок не согласован.',
                 'Повторное использование кода разрешить?', 'Нет, повторное использование запрещено.',
                 'Значит, сам предмет тоже можно получить лишь раз за всё время?',
                 'Такого ограничения нет. Однократность относится только к этому коду.',
                 'Что ещё учесть в задаче?',
                 'Оформи задачу. Для входа в аккаунт код не применять. Если срок не согласован, оставь вопрос о нём.']
        desc = f'Использовать одноразовый код для {purpose}. Повторное использование этого кода запрещено. '
        desc += f'Срок действия кода — {seconds} секунд. ' if lifetime else 'Срок действия кода не согласован. '
        desc += 'Не ограничивать этим правилом повторное получение предмета с другим кодом. Для входа в аккаунт код не использовать.'
        draft(f'code-scope-{context}-{int(lifetime)}', turns, desc, 'Одноразовый код')
        if not lifetime:
            answer = json.loads(rows[-1]['messages'][-1]['content'])
            answer['questions'] = ['Какой срок действия кода установить?']
            rows[-1]['messages'][-1]['content'] = json.dumps(answer, ensure_ascii=False)

# Lists vary length, duplicate count, signs, input permutation and direction.
# Correct outputs are computed from the values, not copied from model answers.
values = [
    [-83,-14,-57,-14], [-92,-31,-6], [-17,-104,-17,-62,-5],
    [-4,-41,-73,-41,-4], [-68,-12,-35,-12], [-99,-7,-55,-7,-23],
    [-28,0,-81,13,-28], [6,-44,0,-3,6], [-5,-115,-47,-47],
    [-2,-9,-21,-9,-2,-21], [-36,-36,-8,-61], [-74,-18,-52,-18,-74],
]
for i, numbers in enumerate(values):
    for descending in [False, True]:
        direction = 'по убыванию' if descending else 'по возрастанию'
        words = 'от большего к меньшему' if descending else 'от меньшего к большему'
        listed = ', '.join(map(str, numbers))
        for form, prompt in enumerate([
            f'Список: {listed}. Отсортируй {direction}. Верни только JSON-массив.',
            f'Расставь {words} значения {listed}. Повторы сохранить. Ответ в JSON-массиве.',
            f'Нужен порядок {direction} для [{listed}]. Сохрани все элементы и их знаки. Выведи JSON-массив.',
        ]):
            for dialogue in [False, True]:
                messages = [{'role':'user','content':prompt}]
                if dialogue:
                    messages += [{'role':'assistant','content':'Убрать одинаковые значения?'},
                                 {'role':'user','content':'Нет, сохранить повторы. Направление сортировки прежнее. Только JSON-массив.'}]
                messages += [{'role':'assistant','content':json.dumps(sorted(numbers, reverse=descending))}]
                rows.append({'id':f'contrast-sort-{i}-{int(descending)}-{form}-{int(dialogue)}','task':'general','messages':messages})

assert len(rows) == 208
assert len({row['id'] for row in rows}) == len(rows)
seen = {}
for row in rows:
    key = json.dumps(row['messages'][:-1], ensure_ascii=False, sort_keys=True)
    answer = json.loads(row['messages'][-1]['content'])
    assert key not in seen
    seen[key] = answer
    if row['task'] == 'draft':
        assert set(answer) == {'summary', 'description', 'questions'}
        assert all(literal in answer['description'] for literal in row.get('required_literals', []))
        assert sum(m['role'] == 'user' for m in row['messages']) == 5
(R / 'contrasts.jsonl').write_text(''.join(json.dumps(row, ensure_ascii=False)+'\n' for row in rows))
print('Authored', len(rows), 'training-only contrasts: 64 five-user-turn drafts and 144 sorts.')
