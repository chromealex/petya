"""Prepare correction rehearsal and freeze independent prompts before inference."""
import copy, hashlib, json
from pathlib import Path
R=Path(__file__).parent
OLD=R.parent/'requirements-draft-v7'
def read(p): return list(map(json.loads,p.read_text().splitlines()))
def write(name,rows):
 p=R/name;p.write_text(''.join(json.dumps(x,ensure_ascii=False)+'\n' for x in rows));return hashlib.sha256(p.read_bytes()).hexdigest()
def canonical(r):
 r=copy.deepcopy(r);v=json.loads(r['messages'][-1]['content'])
 if r['task']=='draft':v={k:v[k] for k in ['description','questions','summary']}
 r['messages'][-1]['content']=json.dumps(v,ensure_ascii=False,separators=(',',':'));return r
queue=read(OLD/'next-corrections.jsonl')
corrections=[canonical(dict(id=q['id'],task=q['task'],messages=q['messages']+[dict(role='assistant',content=q['chosen'])])) for q in queue]
NUM=corrections[0]['messages'][0]['content'];DRAFT=corrections[-1]['messages'][0]['content']
def bounds(id,note,lo=None,hi=None,li=None,ui=None,history=None):
 turns=(history or [])+[note+' Выдели действующую норму.']
 m=[dict(role='system',content=NUM)]+[dict(role='user' if i%2==0 else 'assistant',content=t) for i,t in enumerate(turns)]
 m.append(dict(role='assistant',content=json.dumps(dict(status='open' if lo is None and hi is None else 'final',lower=lo,upper=hi,lowerInclusive=li,upperInclusive=ui),ensure_ascii=False)))
 return canonical(dict(id=id,task='bounds',messages=m))
def draft(id,turns,title,desc,questions=None):
 assert len(turns)%2==1 and len(turns)>=7
 m=[dict(role='system',content=DRAFT)]+[dict(role='user' if i%2==0 else 'assistant',content=t) for i,t in enumerate(turns)]
 m.append(dict(role='assistant',content=json.dumps(dict(summary=title,description=desc,questions=questions or []),ensure_ascii=False)))
 return canonical(dict(id=id,task='draft',messages=m))
variants=[]
for i,n in enumerate([17,32,46,61]):
 hist=['Обсуждали другую норму, но её отменили.','Какое условие осталось?'] if i%2 else []
 variants += [bounds(f'below-{i}',f'Температура ниже -{n} °C, равенство запрещено.',hi=-n,ui=False,history=hist),bounds(f'atmost-{i}',f'Температура максимум минус {n} градусов, само это значение допустимо.',hi=-n,ui=True,history=hist),bounds(f'revoke-{i}',f'Прежний срок {n} секунд отменён. Никакого нового срока пока нет.',history=hist),bounds(f'suggest-{i}',f'Обсудили вариант {n},5 литра, но решение ещё не принято.',history=hist)]
for i,(thing,field,fmt) in enumerate([('чертежа','размеры','DXF'),('маршрута','длину','GPX'),('таблицы','заголовки','CSV'),('сцены','координаты','FBX')]):
 variants.append(draft(f'export-{i}',[f'В экспорт {thing} включить {field} и название. Формат не выбран, предложен {fmt}.','Временно утвердим предложенный формат?','Нет, он только обсуждается.','Название убрать?','Нет, оставить.','Что остаётся уточнить?','Только формат. Составь задачу.'],f'Экспорт {thing}',f'В экспорт {thing} включить {field} и название. Формат не утверждён; {fmt} остаётся предложением.',[f'Какой формат экспорта {thing} выбрать?']))
for i,(old,new,color) in enumerate([('Каталог','Витрина','зелёным'),('Архив','История','синим'),('Заявки','Обращения','жёлтым'),('Отчёты','Аналитика','серым')]):
 variants.append(draft(f'rename-{i}',[f'Переименуем раздел «{old}» в «{new}», значок сделаем {color}.','Адрес и содержимое изменять?','Нет, сохранить.','Переименование подтверждаете?',f'Нет, отменяем его. Остаётся «{old}».','А цвет?','Цвет меняем, как договорились. Оформи итог.'],f'Значок раздела «{old}»',f'Сделать значок раздела «{old}» {color}. Название «{old}», адрес и содержимое сохранить.'))
for i,(obj,field,hidden) in enumerate([('автомобиля','пробег','стоимость'),('станка','дату проверки','серийный номер'),('помещения','площадь','имя владельца'),('заказа','дату доставки','телефон клиента')]):
 variants.append(draft(f'questions-{i}',[f'Карточка {obj}: название текстом и {field}. Скрывать {hidden}.','Цвет названия выбран?','Нет, ещё открыт.','Порядок карточек?','Тоже не выбран.','Название убрать?','Нет. Составь задачу и оставь два вопроса: цвет и порядок.'],f'Карточка {obj}',f'Показывать название текстом и {field}. Скрывать {hidden}. Цвет названия и порядок карточек не выбраны.',['Какой цвет названия выбрать?','Какой порядок карточек выбрать?']))
train=read(OLD/'expanded-train.jsonl')+corrections*8+variants
assert len(train)==364 and len(variants)==28
checks=[]
# New numbers, asymmetric intervals, explicit decisions and 1/3/7-turn histories.
for i,(id,note,lo,hi,li,ui) in enumerate([
 ('n01','Температура должна быть меньше минус 38 градусов.',None,-38,None,False),
 ('n02','Допустима температура не выше -72 градусов.',None,-72,None,True),
 ('n03','Температура выше -38 градусов, равенство исключено.',-38,None,False,None),
 ('n04','Температура не ниже -72 градусов.',-72,None,True,None),
 ('n05','Предел давления — не более 6,125 бара.',None,6.125,None,True),
 ('n06','Давление строго превышает 6,125 бара.',6.125,None,False,None),
 ('n07','Смещение больше -22 мм, но не больше -3 мм.',-22,-3,False,True),
 ('n08','Смещение не меньше -22 мм и меньше -3 мм.',-22,-3,True,False),
 ('n09','Предложение: 243 секунды. Утверждения ещё не было.',None,None,None,None),
 ('n10','Утвердили ровно 243 секунды.',243,243,True,True),
 ('n11','Раньше утвердили 68 секунд, сейчас отменили. Замену не выбрали.',None,None,None,None),
 ('n12','Прежние 68 секунд отменили и утвердили ровно 91 секунду.',91,91,True,True),
 ('n13','Пока обсуждаем 8,375 литра; решение отложено.',None,None,None,None),
 ('n14','Обсуждение завершено: объём ровно 8,375 литра утверждён.',8.375,8.375,True,True),
 ('n15','Число записей строго меньше 863.',None,863,None,False),
 ('n16','Число записей не меньше 863.',863,None,True,None),
 ('n17','Диапазон от -11,5 до 2,75 включительно с обеих сторон.',-11.5,2.75,True,True),
 ('n18','Допускается больше -11,5 и меньше 2,75.',-11.5,2.75,False,False),
 ('n19','Никакой числовой лимит не согласован.',None,None,None,None),
 ('n20','Ровно ноль ошибок — утверждённое условие.',0,0,True,True),
 ('n21','Отрицательная температура: максимум -0,75 градуса включительно.',None,-0.75,None,True),
 ('n22','Температура строго ниже -0,75 градуса.',None,-0.75,None,False),
 ('n23','Время ожидания больше 36 и не больше 44 секунд.',36,44,False,True),
 ('n24','Предложенный диапазон 36–44 секунды не утвердили.',None,None,None,None),
]):
 h=[] if i%3==0 else ['Прежние ограничения отменены.','Какое решение учитывать?'] if i%3==1 else ['Установим старый предел 100?','Подтверждаете 100?','Нет, это только предложение.','Тогда какое условие будет?','Сейчас скажу окончательное состояние.','Слушаю.']
 checks.append(bounds(id,note,lo,hi,li,ui,h))
checks += [
 draft('d-export',['Выгрузка расписания содержит часовой пояс и код рейса. Формат открыт; обсуждали XML.','Утвердим его на время?','Нет, и временного формата нет.','Часовой пояс исключить?','Нет, он нужен.','О чём спросить?','Только о формате выгрузки.'], 'Выгрузка расписания','Включать часовой пояс и код рейса. Формат не выбран; XML только обсуждался.',['Какой формат выгрузки выбрать?']),
 draft('d-rename',['Раздел «Договоры» станет «Соглашения», значок — фиолетовым.','Менять адрес и содержимое?','Нет.','Новое имя остаётся?','Нет, вернём название «Договоры».','Значок тоже вернуть?','Нет, фиолетовый нужен. Оформи.'],'Значок договоров','Сделать значок раздела «Договоры» фиолетовым. Сохранить название, содержимое и адрес.'),
 draft('d-open',['На карточке склада показывать название текстом и вместимость. Адрес скрывать.','Размер названия выбран?','Нет.','А порядок карточек?','Тоже открыт.','Вместимость убрать?','Нет. Подготовь задачу с двумя вопросами: размер и порядок.'],'Карточки складов','Показывать название текстом и вместимость. Адрес скрывать. Размер названия и порядок карточек пока не выбраны.',['Какой размер названия выбрать?','Какой порядок карточек выбрать?']),
 draft('d-print',['Печатать талон с номером очереди, временем записи и названием кабинета. Паспортные данные не печатать.','Поиск записи нужен?','Нет.','Формат времени?','ЧЧ:ММ.','Название кабинета убрать?','Нет. Оформи печать.'],'Печать талона','Печатать номер очереди, время записи в формате ЧЧ:ММ и название кабинета. Паспортные данные не печатать. Поиск записи не добавлять.'),
 draft('d-failure',['Только при сбое сверки уведомлять аудитора: идентификатор сверки и причина.','При успешной сверке уведомлять?','Нет.','Фамилию сотрудника показывать?','Нет.','Идентификатор заменить номером ошибки?','Нет. Составь задачу.'],'Уведомление о сбое сверки','Только при сбое сверки уведомлять аудитора, передавать идентификатор сверки и причину. Фамилию сотрудника скрывать. При успешной сверке не уведомлять.'),
 draft('d-report',['Отчёт отгрузки идёт логисту, покупателю не идёт. Он содержит код заказа и результат.','Телефон водителя показывать?','Нет.','Код заказа оставить?','Нет, вместо него код накладной.','Получателей менять?','Нет. Оформи.'],'Отчёт отгрузки','Отправлять логисту код накладной и результат отгрузки. Покупателю не отправлять. Телефон водителя скрывать.'),
 draft('d-bound',['Влажность должна быть строго меньше 67 процентов. Оператор видит номер камеры при любой влажности.','При превышении номера не видно?','Нет, номер виден всегда.','Имя арендатора показывать?','Нет.','Добавить управление вентилятором?','Нет, это другая задача. Оформи.'],'Контроль камеры','Влажность строго меньше 67 процентов. Оператор видит номер камеры независимо от влажности. Имя арендатора скрывать. Управление вентилятором не добавлять.'),
 draft('d-refresh',['На панели показывать количество свободных мест. Обновлять раз в 113 секунд. Имена посетителей скрывать.','113 секунд остаётся?','Нет, ровно 97.','Число мест убрать?','Нет.','Имена показать?','Нет. Составь итог.'],'Обновление панели','Показывать количество свободных мест. Обновлять каждые 97 секунд. Имена посетителей скрывать.'),
 draft('d-approved',['Экспорт каталога включает название и артикул. Формат пока открыт: предложили YAML.','Утверждаем YAML?','Да, окончательно.','Артикул убрать?','Нет.','Оставить вопрос про формат?','Нет, мы уже выбрали. Оформи задачу.'],'Экспорт каталога','Экспортировать название и артикул в утверждённом формате YAML.'),
 draft('d-partial',['Раздел «Поставки» переименуем в «Партии», значок будет оранжевым.','Адрес и данные менять?','Нет.','Переименование отменить?','Нет, новое название оставляем.','Цвет тоже оставляем?','Нет, цвет менять не надо. Оформи.'],'Переименование поставок','Переименовать «Поставки» в «Партии». Цвет значка, адрес и данные не менять.'),
 draft('d-resolved',['Карточка книги: название текстом и автор, закупочную цену скрывать.','Цвет заголовка выбран?','Да, чёрный.','Порядок карточек?','Пока не выбран.','Автора убрать?','Нет. Оформи и оставь только вопрос о порядке.'],'Карточки книг','Показывать название чёрным текстом и автора. Закупочную цену скрывать. Порядок карточек пока не выбран.',['В каком порядке показывать карточки?']),
 draft('d-shift',['В письме клиенту показывать номер брони и дату заселения. Телефон администратора скрывать.','Добавить оплату?','Нет.','Теперь обсудим уборку?','Уборка отдельно, вернёмся к письму.','Дату заменить временем?','Нет, оставить дату в формате ГГГГ-ММ-ДД. Подготовь только задачу письма.'],'Письмо о брони','В письме клиенту показывать номер брони и дату заселения в формате ГГГГ-ММ-ДД. Телефон администратора скрывать. Оплату и уборку в задачу не включать.'),
]
for id,q,a in [
 ('g1','Ответь только числом: 23 умножить на 17.','391'),('g2','Отсортируй 8, -2, 5 по возрастанию. Верни только JSON-массив.','[-2,5,8]'),('g3','Ответь только числом: len("Петя") в Python.','4'),('g4','Напиши ровно слово: Принято','Принято'),('g5','Вычисли 81 минус 34. Ответь только числом.','47'),('g6','Верни только значение count из JSON {"count":42,"label":"Далее"}.','42'),('g7','Задание отменили до запуска. Оно выполнено? Ответь только «да» или «нет».','нет'),('g8','Ответь только числом: 125 плюс 275.','400')]:
 checks.append(dict(id=id,task='general',messages=[dict(role='user',content=q),dict(role='assistant',content=a)]))
assert len(checks)==44
sig=lambda r:json.dumps(r['messages'][:-1],ensure_ascii=False,sort_keys=True)
assert set(map(sig,train)).isdisjoint(map(sig,checks))
assert len(set(map(sig,checks)))==len(checks)
prior=[]
for path in OLD.glob('*.jsonl'):
 for row in read(path):
  if 'messages' in row and row['messages'][-1]['role']=='assistant':prior.append(row)
assert set(map(sig,checks)).isdisjoint(map(sig,prior))
assert {r['id'] for r in checks}.isdisjoint(r['id'] for r in train)
hashes={name:write(name,rows) for name,rows in [('train.jsonl',train),('corrections.jsonl',corrections),('variants.jsonl',variants),('check.jsonl',checks)]}
(R/'protocol.json').write_text(json.dumps(dict(hashes=hashes,parent='../requirements-draft-v7/deep-adapter',epochs=2,lr=0.00003,layers=5,seed=42,training_rows=len(train),steps=len(train)*2,new_cases={'bounds':24,'draft':12,'general':8},selection='One fixed candidate; no checkpoint selection on reserved checks.',improvement_gate='All seven corrected examples semantically correct after reload; numeric and general no worse than both parent and base; complete draft score greater than both on new cases.',release_gate='All targeted numeric and draft checks pass, plus broader deployment validation; this research alone cannot authorize release.',draft_rubric='Valid JSON summary/description strings and questions list of strings; all agreed constraints retained, no invented requirements or reopened settled questions. Semantically equivalent wording and logically entailed exclusions accepted. Manual non-blind assessment; no exact wording criterion.',limitations='Synthetic related families, not real-user or broad intelligence evidence; greedy diagnostic inference only. Old deep-check is now development.'),indent=2)+'\n')
print('Prepared',len(train),'training rows and',len(checks),'reserved checks.')
