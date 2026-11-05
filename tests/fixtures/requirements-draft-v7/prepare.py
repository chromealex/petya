"""Balance grounded drafts and numeric retention; freeze new final cases."""
import json
from pathlib import Path
ROOT=Path(__file__).parent
v6=ROOT.parent/'requirements-draft-v6'
records=[json.loads(s) for s in (v6/'train.jsonl').read_text().splitlines()]+[json.loads(s) for s in (v6/'test.jsonl').read_text().splitlines()]
NUM=next(r for r in records if r['task']=='bounds')['messages'][0]['content']
DRAFT=next(r for r in records if r['task']=='draft')['messages'][0]['content']

def canonical(row):
 row=json.loads(json.dumps(row));value=json.loads(row['messages'][-1]['content'])
 if row['task']=='draft':value={k:value[k] for k in ['description','questions','summary']}
 row['messages'][-1]['content']=json.dumps(value,ensure_ascii=False,separators=(',',':'))
 return row
records=list(map(canonical,records));assert len(records)==152 and len({r['id'] for r in records})==152
hard_ids={r['id'] for r in map(json.loads,(ROOT/'control.jsonl').read_text().splitlines())}
train=[]
for row in records:train.extend([row]*(3 if row['task']=='draft' else 1))
train += [r for r in records if r['id'] in hard_ids]*2
assert len(train)==248
(ROOT/'train.jsonl').write_text(''.join(json.dumps(r,ensure_ascii=False)+'\n' for r in train))

def bound(id,note,lo,hi,li,ui):
 answer=dict(status='open' if lo is None and hi is None else 'final',lower=lo,upper=hi,lowerInclusive=li,upperInclusive=ui)
 return dict(id=id,task='bounds',messages=[dict(role='system',content=NUM),dict(role='user',content=note),dict(role='assistant',content=json.dumps(answer,ensure_ascii=False))])
test=[]
for id,note,lo,hi,li,ui in [
 ('neg-lower','Температура, градусов: допускается строго выше минус 23.',-23,None,False,None),
 ('neg-upper','Температура, градусов: допускается строго ниже минус 23.',None,-23,None,False),
 ('neg-inclusive','Температура, градусов: не ниже минус 14.',-14,None,True,None),
 ('neg-ceiling','Температура, градусов: не выше минус 14.',None,-14,None,True),
 ('decimal-floor','Масса, кг: больше 6,25.',6.25,None,False,None),
 ('decimal-ceiling','Масса, кг: максимум 6,25 включительно.',None,6.25,None,True),
 ('mixed-low','Смещение, мм: больше минус 5, но не больше 3.',-5,3,False,True),
 ('mixed-high','Смещение, мм: не меньше минус 5, но меньше 3.',-5,3,True,False),
 ('exact-new','Длительность, секунд: раньше было 114. Утвердили ровно 117.',117,117,True,True),
 ('cancel-new','Длительность, секунд: ровно 117 было утверждено, но затем полностью отменено. Новое значение ещё не выбрали.',None,None,None,None),
 ('strict-count','Число модулей: строго больше 421.',421,None,False,None),
 ('max-count','Число модулей: не больше 421.',None,421,None,True),
 ('closed-new','Уровень, процентов: от 44 до 81, обе границы включены.',44,81,True,True),
 ('open-new','Уровень, процентов: строго между 44 и 81, границы исключены.',44,81,False,False),
 ('proposal-new','Площадь, м²: предложили 8,75; пока не согласовали.',None,None,None,None),
 ('approved-new','Площадь, м²: утвердили ровно 8,75.',8.75,8.75,True,True),
]:test.append(bound(id,note,lo,hi,li,ui))

def draft(id,turns,title,desc,questions=None):
 assert len(turns)==7
 m=[dict(role='system',content=DRAFT)]+[dict(role='user' if i%2==0 else 'assistant',content=t) for i,t in enumerate(turns)]
 m.append(dict(role='assistant',content=json.dumps(dict(summary=title,description=desc,questions=questions or []),ensure_ascii=False)))
 test.append(dict(id=id,task='draft',messages=m))

draft('receipt-new',['Печатать квитанцию: номер договора, дата оплаты и сумма. Телефон плательщика не выводить.','Нужен поиск договора?','Нет, только печать.','Формат даты?','ГГГГ-ММ-ДД.','Сумму оставляем?','Да, сформулируй задачу по этим условиям.'],'Печать квитанции','Печатать номер договора, дату оплаты в формате ГГГГ-ММ-ДД и сумму. Телефон плательщика не выводить. Поиск договора не добавлять.')
draft('failure-new',['Только при провале теста уведомлять тестировщика: номер запуска и текст причины.','При успехе тоже?','Нет.','Включить имя автора?','Нет, имя скрыто.','Номер ошибки вместо запуска?','Нет, именно номер запуска. Подготовь задачу.'],'Уведомление о провале теста','Только при провале теста уведомлять тестировщика, передавать номер запуска и текст причины. Имя автора скрывать. При успехе уведомление не отправлять.')
draft('roles-new',['Отчёт упаковки отправить бригадиру, директору не отправлять. В нём номер партии и результат.','Адрес сборщика показывать?','Нет.','Номер партии меняем?','Да, заменяем его номером смены.','Получатели без изменений?','Да. Составь итоговую задачу.'],'Отчёт упаковки','Отправлять бригадиру номер смены и результат упаковки. Директору не отправлять. Адрес сборщика скрывать.')
draft('scope-new',['Давление должно быть меньше 91 бар. Инженер видит номер насоса независимо от давления.','При большем давлении номер скрывать?','Нет, он виден всегда.','Имя владельца показывать?','Нет.','Добавить охлаждение?','Нет, это другая задача. Подготовь задачу насоса.'],'Контроль насоса','Давление строго меньше 91 бар. Инженеру показывать номер насоса независимо от давления. Имя владельца скрывать. Охлаждение не добавлять.')
draft('format-new',['В экспорт маршрута включаем расстояние и номер редакции. Формат пока открыт, обсуждали GPX.','Временно утвердить GPX?','Нет.','Расстояние убрать?','Нет, оно обязательно.','Что остаётся спросить?','Только формат. Составь задачу.'],'Экспорт маршрута','В экспорт включать расстояние и номер редакции. Формат не согласован; GPX только обсуждался.',['Какой формат экспорта маршрута выбрать?'])
draft('period-new',['Статистика обновляется раз в 46 секунд и показывает количество подключений.','Имена пользователей видны?','Нет, скрыты.','Оставляем 46?','Нет, теперь ровно 41 секунда.','Что ещё меняется?','Ничего. Оформи задачу.'],'Обновление статистики','Обновлять статистику каждые 41 секунду. Показывать количество подключений. Имена пользователей скрывать.')
draft('rename-new',['Экран «Доставка» переименуем в «Рейсы». Кнопки делаем фиолетовыми.','Ссылку и содержимое менять?','Нет.','Название окончательное?','Переименование отменяем, остаётся «Доставка».','Цвет оставлять?','Да. Подготовь задачу только по действующему решению.'],'Цвет кнопок доставки','Сделать кнопки экрана «Доставка» фиолетовыми. Название, ссылку и содержимое не менять.')
draft('status-new',['Карточка оборудования показывает состояние и дату осмотра. Цену скрываем.','Состояние как показывать?','Текстом.','Какой цвет?','Ещё не выбрали.','Дату осмотра убрать?','Нет, оставляем. Оформи задачу с одним открытым вопросом.'],'Карточка оборудования','Показывать состояние текстом и дату осмотра. Цену скрывать. Цвет состояния пока не выбран.',['Какой цвет использовать для состояния?'])
# Narrow retention smoke tests, not a broad intelligence benchmark.
for id,question,answer in [
 ('multiply','Верни только число: 47 умножить на 13.','611'),
 ('sort-list','Отсортируй числа 9, 2, 5 по возрастанию. Верни только JSON-массив.','[2,5,9]'),
 ('python-length','Чему равно выражение Python len([3, 1, 4])? Верни только число.','3'),
 ('literal','Ответь ровно одним словом: Готово','Готово'),
 ('translation','Переведи на русский: The file is ready. Верни только перевод.','Файл готов.'),
 ('read-json','Из записи {"name":"Ира","count":7} извлеки count. Верни только число.','7'),
 ('cancel-action','Я собирался отправить письмо, но отменил отправку до её начала. Письмо отправлено? Ответь только «да» или «нет».','нет'),
 ('sum','Сложи 125 и 275. Ответь только числом.','400'),
]:test.append(dict(id=id,task='general',messages=[dict(role='user',content=question),dict(role='assistant',content=answer)]))
assert len(test)==32
assert {r['id'] for r in records}.isdisjoint(r['id'] for r in test)
assert {json.dumps(r['messages'][:-1],ensure_ascii=False) for r in records}.isdisjoint(json.dumps(r['messages'][:-1],ensure_ascii=False) for r in test)
(ROOT/'test.jsonl').write_text(''.join(json.dumps(r,ensure_ascii=False)+'\n' for r in test))
print('248 training rows / 152 distinct examples; 16 numeric, 8 draft and 8 general final checks.')
