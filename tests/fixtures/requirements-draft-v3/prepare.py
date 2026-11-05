"""Build synthetic multi-turn supervision without reusing evaluation topics."""
import json
from pathlib import Path

ROOT = Path(__file__).parent
SYSTEM = ('Составь задачу Jira на русском. Верни JSON summary, description, questions. '
          'Сохрани все согласованные требования и точные границы. '
          'В questions включи только оставшиеся открытые вопросы.')
TRAIN = [
    ('sensors', 'датчики', 'Количество датчиков в комплекте', 14, 'сборщику', 'номер партии', 'имя клиента'),
    ('labels', 'этикетки', 'Количество этикеток на листе', 18, 'печатнику', 'код макета', 'телефон клиента'),
    ('trays', 'лотки', 'Количество лотков в ящике', 22, 'кладовщику', 'номер заказа', 'адрес клиента'),
    ('lamps', 'лампы', 'Количество ламп в наборе', 27, 'монтажнику', 'код помещения', 'имя владельца'),
    ('valves', 'клапаны', 'Количество клапанов в упаковке', 31, 'контролёру', 'номер проверки', 'телефон заказчика'),
    ('cards', 'карточки', 'Количество карточек в пачке', 38, 'оператору печати', 'код тиража', 'адрес заказчика'),
    ('bolts', 'болты', 'Количество болтов в пакете', 46, 'комплектовщику', 'артикул', 'имя покупателя'),
    ('tiles', 'плитки', 'Количество плиток в коробке', 52, 'упаковщику', 'код рисунка', 'телефон покупателя'),
]
HOLDOUT = [
    ('filters', 'фильтры', 'Количество фильтров в кассете', 37, 'технику', 'номер смены', 'адрес владельца'),
    ('folders', 'папки', 'Количество папок в архивном блоке', 43, 'архивариусу', 'индекс дела', 'телефон заявителя'),
]
KINDS = {
    'exact': ('ровно {n}', 'ровно {n}'),
    'less': ('строго меньше {n}', 'строго меньше {n}'),
    'max': ('не больше {n}', 'не больше {n}'),
    'min': ('не меньше {n}', 'не меньше {n}'),
    'more': ('строго больше {n}', 'строго больше {n}'),
    'open': ('предложено {n}, решение отложено до испытаний', None),
}

def rows(topics, held_out=False):
    result = []
    for topic, subject, target, n, recipient, field, hidden in topics:
        for kind, (decision, approved) in KINDS.items():
            fixed = f'Передавать {recipient} {field}. Не показывать {hidden}.'
            decision = decision.format(n=n)
            if held_out:
                turns = [
                    ('user', f'Нужна задача про {subject}. Получатель — {recipient}; ему нужен {field}. {hidden.capitalize()} выводить запрещено.'),
                    ('assistant', 'Какое количество следует указать?'),
                    ('user', f'Раньше обсуждали {n + 7}, но эту цифру убрали. Текущее решение: {decision}.'),
                    ('assistant', 'Нужны дополнительные ограничения?'),
                    ('user', 'Нет. Подготовь итоговую задачу по текущим решениям.'),
                ]
            else:
                turns = [
                    ('user', f'Подготовим задачу про {subject}. {fixed}'),
                    ('assistant', 'Что известно о количестве?'),
                    ('user', f'В старой записи было {n + 3}.'),
                    ('assistant', 'Это уже согласованное значение?'),
                    ('user', f'Нет, старую запись отменили. Теперь {decision}.'),
                    ('assistant', 'Есть другие условия для задачи?'),
                    ('user', 'Других условий нет. Составь черновик по этому обсуждению.'),
                ]
            questions = [f'Какое значение согласовать для условия «{target}» после испытаний?'] if kind == 'open' else []
            boundary = (f'{target}: {approved.format(n=n)}.' if approved else
                        f'{target}: норма пока не согласована; {n} — только предложение до испытаний.')
            answer = dict(summary=f'Подготовить {subject}', description=fixed + ' ' + boundary, questions=questions)
            messages = [{'role': 'system', 'content': SYSTEM}] + [dict(role=r, content=c) for r,c in turns]
            messages.append(dict(role='assistant', content=json.dumps(answer, ensure_ascii=False)))
            result.append(dict(id=f'{topic}-{kind}', topic=topic, kind=kind, source='synthetic',
                               messages=messages, rubric=dict(recipient=recipient, requiredField=field,
                               hiddenField=hidden, value=n, status='open' if kind=='open' else 'final',
                               boundary=kind, obsoleteValue=n+7 if held_out else n+3,
                               requireNoReconfirmation=kind!='open')))
    return result

if __name__ == '__main__':
    train, holdout = rows(TRAIN), rows(HOLDOUT, True)
    assert {r['topic'] for r in train}.isdisjoint(r['topic'] for r in holdout)
    assert {r['rubric']['value'] for r in train}.isdisjoint(r['rubric']['value'] for r in holdout)
    for name, records in [('train', train), ('holdout', holdout)]:
        assert len({r['id'] for r in records}) == len(records)
        for row in records:
            answer = json.loads(row['messages'][-1]['content'])
            assert set(answer) == {'summary', 'description', 'questions'}
            assert bool(answer['questions']) == (row['kind'] == 'open')
            assert row['rubric']['recipient'] in answer['description']
        (ROOT / f'{name}.jsonl').write_text(''.join(json.dumps(r, ensure_ascii=False)+'\n' for r in records))
    print(f'Validated {len(train)} training and {len(holdout)} held-out records.')
