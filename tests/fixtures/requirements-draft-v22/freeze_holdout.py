"""Freeze authored, historically prompt-disjoint v22 evaluation cases."""
import hashlib
import json
import sys
from pathlib import Path
R = Path(__file__).resolve().parent
read = lambda p: [json.loads(s) for s in p.read_text().splitlines()]
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
sig = lambda r: json.dumps(r['messages'][:-1], ensure_ascii=False, sort_keys=True)
system = read(R.parent / 'requirements-draft-v21/fresh-drafts.jsonl')[0]['messages'][0]
drafts = []
def draft(key, turns, title, description, questions=None, literals=()):
    assert len(turns) == 9
    messages = [system] + [dict(role='user' if i % 2 == 0 else 'assistant', content=t) for i, t in enumerate(turns)]
    messages.append(dict(role='assistant', content=json.dumps(dict(summary=title, description=description, questions=questions or []), ensure_ascii=False)))
    row = dict(id='v22-new-'+key, task='draft', messages=messages)
    if literals: row['required_literals'] = list(literals)
    drafts.append(row)
draft('cancel-one', [
'В редакторе заменить draft_key на final_key и local_tag на public_tag.', 'Обе замены подтверждены?',
'Да. Но теперь отменяю замену draft_key.', 'Значения этого поля тоже запретить менять?',
'Нет, речь только о названии.', 'А local_tag?', 'Его переименование остаётся.',
'Подготовить итог?', 'Да, учти последнюю отмену.'],
'Названия полей редактора', 'Сохранить название draft_key без замены на final_key. Переименовать local_tag в public_tag. Отмена переименования draft_key не запрещает менять значения этого поля.', literals=('draft_key','final_key','local_tag','public_tag'))
draft('cancel-two', [
'В таблице river_id переименуем в stream_id, а hill_id в ridge_id.', 'Начать с river_id?',
'Сначала отмена: вторую замену делать не надо.', 'Значит, обе отменены?',
'Нет, только hill_id на ridge_id.', 'Первую оставляем?', 'Да, её согласовали.',
'Что оформить?', 'Оформи действующее решение.'],
'Переименование в таблице', 'Заменить river_id на stream_id. Сохранить hill_id, не заменять его на ridge_id.', literals=('river_id','stream_id','hill_id','ridge_id'))
draft('two-recipients', [
'Подготовь две одинаковые ведомости для мастера и диспетчера.', 'Можно переслать обе?',
'Мастеру можно. Диспетчеру пока запрещено.', 'Различать содержание?', 'Нет, содержание одинаковое.',
'Добавить пояснение?', 'Не добавляй.', 'Отменяем передачу мастеру?',
'Нет, она разрешена; запрет касается только диспетчера. Запиши задачу.'],
'Ведомости для двух получателей', 'Подготовить две одинаковые ведомости без пояснения. Передача мастеру разрешена, передача диспетчеру запрещена.')
draft('revoke-send', [
'В акте оставь цену и замени старый код позиции новым кодом позиции.', 'Акт передать покупателю?',
'Да, разрешаю.', 'Добавить дату?', 'Дата не нужна.', 'Отправлять сейчас?',
'Отменяю разрешение отправки покупателю.', 'И замену кода отменяем?',
'Нет, код заменить, цену сохранить, акт пока не отправлять. Составь задачу.'],
'Подготовка акта', 'Сохранить цену и заменить старый код позиции новым кодом позиции. Дату не добавлять. Разрешение отправки покупателю отменено; акт не отправлять.')
draft('restore-send', [
'Сформируй талон с номером места и временем сеанса. Кассиру не пересылай.', 'Добавить стоимость?',
'Нет, стоимость не указываем.', 'Запрет кассиру остаётся?', 'Теперь снимаю его: кассиру можно переслать талон.',
'Номер места убрать?', 'Оставь номер и время.', 'Что записать?', 'Итоговые требования с новым разрешением.'],
'Талон для кассира', 'Сформировать талон с номером места и временем сеанса, без стоимости. Пересылка талона кассиру разрешена; прежний запрет отменён.')
draft('code-item', [
'Одноразовый код нужен для получения набора деталей, действует 347 секунд.', 'Использовать для входа?',
'Нет, вход не связан с ним.', 'Тот же код можно ввести ещё раз?', 'После получения набора он использован и повторно не подходит.',
'Значит, больше наборов получить нельзя?', 'Нет, другой набор можно получить по новому коду.',
'Составить задачу?', 'Да, сохрани это различие.'],
'Код получения набора', 'Одноразовый код получения набора деталей действует 347 секунд и не используется для входа. После получения набора тот же код повторно использовать нельзя. Другой набор можно получить по новому коду.')
draft('open-duration', [
'По одноразовому коду забирают инструмент со склада.', 'Срок 180 секунд?', 'Этот срок не согласован.',
'Для авторизации тоже применять?', 'Нет, код не для входа.', 'Какой срок тогда?',
'Решим позже, сейчас значения нет.', 'Что подготовить?', 'Задачу и вопрос по неустановленному сроку.'],
'Код выдачи инструмента', 'Использовать одноразовый код для получения инструмента со склада, не для входа. Срок действия пока не определён.', ['Какой срок действия установить для кода?'])
draft('exact-name', [
'Заголовок отчёта: «Ёмкость_QA-0076». Файл: ёмкость_0076.csv.', 'Сделать латиницей?',
'Нет, оставь написание точно.', 'А начальные нули?', 'Их тоже сохранить.',
'Запретить переименование всех остальных файлов?', 'Нет, обсуждаем только этот заголовок и этот файл.',
'Записать итог?', 'Да.'],
'Название отчёта и файла', 'Использовать заголовок «Ёмкость_QA-0076» и имя файла ёмкость_0076.csv без изменения букв и начальных нулей.', literals=('Ёмкость_QA-0076','ёмкость_0076.csv'))
draft('screen-only', [
'На экране переименовать origin_code в route_code.', 'Перенести значения в новое поле базы?',
'Нет, данные не переносить и схему базы не менять.', 'Показать оба названия?', 'Только новое, старое скрыть.',
'Нужна миграция?', 'Нет.', 'Что входит в задачу?', 'Только согласованное изменение на экране, запиши ограничения.'],
'Название на экране', 'На экране показывать route_code вместо origin_code, старое название скрыть. Данные не переносить, схему базы не менять, миграцию не выполнять.', literals=('route_code','origin_code'))
draft('add-separate', [
'В карточке уже есть «Секция» и «Ярус».', 'Нужно новое поле?', 'Добавь «Полка».',
'Вместо секции?', 'Нет, это отдельное дополнительное поле.', 'Ярус убрать?',
'Нет, оба существующих поля сохраняются.', 'Сократить названия?', 'Не сокращай. Составь задачу.'],
'Поля карточки', 'Сохранить поля «Секция» и «Ярус», добавить отдельное поле «Полка». Названия не сокращать.', literals=('Секция','Ярус','Полка'))
draft('quote', [
'В методичке есть цитата «запретить передачу макета».', 'Это запрет на нашу отправку?',
'Нет, это пример фразы в тексте.', 'Удалить цитату?', 'Сохрани её дословно.',
'Методичку можно передать редактору?', 'Да, разрешаю целиком.', 'Что оформить?', 'Задачу с цитатой и разрешением.'],
'Методичка для редактора', 'Сохранить в методичке дословную цитату «запретить передачу макета». Передача всей методички редактору разрешена; цитата не является запретом этой передачи.', literals=('запретить передачу макета',))
draft('recipient-open', [
'Нужно уведомление о переносе встречи в зал 6.', 'Отправить секретарю?', 'Получателя пока не выбирали.',
'Может, координатору?', 'Нет, адресата решим отдельно.', 'Зал остаётся 6?', 'Да.',
'Разослать всем?', 'Нет, без выбранного получателя никому не отправлять. Подготовь задачу.'],
'Уведомление о смене зала', 'Подготовить уведомление о переносе встречи в зал 6. Получатель пока не выбран; никому не отправлять до его выбора.', ['Кому направить уведомление?'])
checks = []
def check(key, task, prompt, target, system_message=None):
    messages = ([system_message] if system_message else []) + [dict(role='user', content=prompt), dict(role='assistant', content=json.dumps(target, ensure_ascii=False))]
    checks.append(dict(id='v22-new-'+key, task=task, messages=messages))
for i, values in enumerate([[-141,-17,-68,-17,-4], [-6,-123,-45,-123,0], [-0.5,-7.25,-0.5,-3.125], [18,-18,0,-81,-18], [-202,-20,-2,-20,-202], [7,-7,7,-70,0]]):
    for descending in [False, True]:
        direction = 'убывания' if descending else 'возрастания'
        check(f'sort-{i}-{int(descending)}', 'general', f'Список измерений: {values}. Переставь все элементы в порядке {direction}, сохрани каждое повторение. Верни только JSON-массив.', sorted(values, reverse=descending))
bs = read(R.parent / 'requirements-draft-v21/check.jsonl')[0]['messages'][0]
for i, (lo, hi) in enumerate([(-84.5,-19.25), (-0.75,0.25), (12.5,48.75)]):
    for j, (li, ui) in enumerate([(True,False),(False,True),(True,True),(False,False)]):
        lower = 'включая' if li else 'исключая'
        upper = 'включая' if ui else 'исключая'
        check(f'bound-{i}-{j}', 'bounds', f'Для величины R согласован интервал от {lo} до {hi}, {lower} нижнюю и {upper} верхнюю границу. Других условий нет.', dict(status='final',lower=lo,upper=hi,lowerInclusive=li,upperInclusive=ui), bs)
check('bound-cancel', 'bounds', 'Порог для датчика был 431. Решение о пороге отменено, новое значение ещё предстоит выбрать.', dict(status='open',lower=None,upper=None,lowerInclusive=None,upperInclusive=None), bs)
check('bound-equal', 'bounds', 'Установлено ровно -13.75, отклонения от этого значения не допускаются.', dict(status='final',lower=-13.75,upper=-13.75,lowerInclusive=True,upperInclusive=True), bs)
for i, (prompt, target) in enumerate([('Ответь только числом: сколько минут в трёх часах?',180),('Только число: 17 умножить на 8.',136),('Ответь числом: сколько миллиметров в двух сантиметрах?',20),('Только число: сколько месяцев в трёх годах?',36)]):
    check('general-'+str(i), 'general', prompt, target)
fresh = drafts + checks
assert (len(drafts),len(checks)) == (12,30)
assert len({r['id'] for r in fresh}) == len(fresh)
assert len(set(map(sig,fresh))) == len(fresh)
sys.path.insert(0,str(R.parent/'requirements-draft-v8'))
from scoring import score
for row in fresh:
    assert score(row,row['messages'][-1]['content']) == dict(exactJSON=True,schemaValid=True)
    turns = row['messages'][1:] if row['messages'][0]['role']=='system' else row['messages']
    assert all(m['role']==('user' if i%2==0 else 'assistant') for i,m in enumerate(turns))
    assert all(x in json.loads(row['messages'][-1]['content'])['description'] for x in row.get('required_literals',[]))
for file in R.parent.glob('requirements-draft-*/*.jsonl'):
    if file.parent==R and file.name in ['check.jsonl','fresh-drafts.jsonl']: continue
    historical = [r for r in read(file) if 'messages' in r]
    assert set(map(sig,fresh)).isdisjoint(map(sig,historical)), file
for name, rows in [('fresh-drafts.jsonl',drafts),('check.jsonl',checks)]:
    (R/name).write_text(''.join(json.dumps(r,ensure_ascii=False)+'\n' for r in rows))
report = dict(status='frozen_before_parent_inference_and_training', drafts=12,checks=30,
    hashes={n:sha(R/n) for n in ['fresh-drafts.jsonl','check.jsonl','train.jsonl','acquisition.jsonl']},
    review='Review every draft against all user turns. Require all explicit constraints, no invented restrictions, consistent recipient scope, usable Russian, correct literals, and only unresolved questions. Equivalent wording is allowed. Numeric checks require exact JSON. Preserve every parent success and improve total after full familiar retention and committed candidate selection.',
    limits='Authored synthetic cases with fixed assistant history; prompt disjointness is not distributional independence or live-dialogue qualification. Never train on these cases before candidate evaluation.')
(R/'holdout-freeze.json').write_text(json.dumps(report,indent=2)+'\n')
print('PASS: 12 five-user-turn drafts and 30 checks; historical prompt disjointness, roles, schemas and exact literals verified.')
