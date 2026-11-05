"""Freeze final checks before inspecting the deeper adapter."""
import hashlib,json
from pathlib import Path
R=Path(__file__).parent
source=list(map(json.loads,(R/'test.jsonl').read_text().splitlines()))
NUM=next(x for x in source if x['task']=='bounds')['messages'][0]['content'];DRAFT=next(x for x in source if x['task']=='draft')['messages'][0]['content']
rows=[]
for i,(id,note,lo,hi,li,ui) in enumerate([
 ('negative-over','Температура строго выше минус 29 градусов.',-29,None,False,None),
 ('negative-under','Температура строго ниже минус 29 градусов.',None,-29,None,False),
 ('negative-inclusive-min','Температура не ниже минус 54 градусов.',-54,None,True,None),
 ('negative-inclusive-max','Температура не выше минус 54 градусов.',None,-54,None,True),
 ('fraction-over','Масса строго больше 9,625 кг.',9.625,None,False,None),
 ('fraction-max','Масса не больше 9,625 кг.',None,9.625,None,True),
 ('mixed-left','Смещение больше минус 13 и не больше 5 мм.',-13,5,False,True),
 ('mixed-right','Смещение не меньше минус 13 и меньше 5 мм.',-13,5,True,False),
 ('exact','Утвердили ровно 157 секунд.',157,157,True,True),
 ('revoked','Решение ровно 157 секунд отменили, новый срок не выбран.',None,None,None,None),
 ('count-min','Допускается строго больше 719 элементов.',719,None,False,None),
 ('count-max','Допускается не больше 719 элементов.',None,719,None,True),
 ('range-closed','Диапазон от 52 до 89 процентов, обе границы включены.',52,89,True,True),
 ('range-open','Допустимо больше 52 и меньше 89 процентов.',52,89,False,False),
 ('proposal','Предложили объём 4,75 литра. Он ещё не утверждён.',None,None,None,None),
 ('approved','Утвердили объём ровно 4,75 литра.',4.75,4.75,True,True),
]):
 m=[dict(role='system',content=NUM)]
 if i%2:m += [dict(role='user',content='Старые нормы отменены.'),dict(role='assistant',content='Какое решение действует сейчас?')]
 m.append(dict(role='user',content=note+' Выдели действующую норму.'))
 v=dict(status='open' if lo is None and hi is None else 'final',lower=lo,upper=hi,lowerInclusive=li,upperInclusive=ui)
 m.append(dict(role='assistant',content=json.dumps(v,ensure_ascii=False)));rows.append(dict(id=id,task='bounds',messages=m))
def draft(id,turns,title,desc,questions=None):
 assert len(turns)%2==1 and len(turns)>=7
 m=[dict(role='system',content=DRAFT)]+[dict(role='user' if i%2==0 else 'assistant',content=t) for i,t in enumerate(turns)]
 m.append(dict(role='assistant',content=json.dumps(dict(summary=title,description=desc,questions=questions or []),ensure_ascii=False)))
 rows.append(dict(id=id,task='draft',messages=m))
draft('permit-print',['Печатать пропуск: код посетителя, дата визита и номер зала. Телефон посетителя не печатать.','Нужен поиск посетителя?','Нет.','Какой формат даты?','ДД-ММ-ГГГГ.','Номер зала оставляем?','Да. Оформи только печать.'],'Печать пропуска','Печатать код посетителя, дату визита в формате ДД-ММ-ГГГГ и номер зала. Телефон посетителя не печатать. Поиск посетителя не добавлять.')
draft('failed-calibration',['Только при неудачной калибровке сообщать технику номер калибровки и текст причины.','При удачной тоже сообщать?','Нет.','Имя заказчика показывать?','Нет, скрывать.','Взять номер ошибки вместо калибровки?','Нет, нужен номер калибровки. Подготовь задачу.'],'Сообщение о неудачной калибровке','Только при неудачной калибровке сообщать технику номер калибровки и текст причины. Имя заказчика скрывать. При удачной калибровке не сообщать.')
draft('repair-report',['Отчёт ремонта отправлять мастеру, собственнику не отправлять. В нём код заявки и результат.','Адрес механика показывать?','Нет.','Код заявки остаётся?','Заменяем его кодом наряда.','Получатели другие?','Нет. Составь задачу с последними изменениями.'],'Отчёт ремонта','Отправлять мастеру код наряда и результат ремонта. Собственнику не отправлять. Адрес механика скрывать.')
draft('tank-reading',['Уровень в баке должен быть строго меньше 83 процентов. Диспетчер видит номер бака независимо от уровня.','При высоком уровне скрывать номер?','Нет, показывать всегда.','Имя владельца показывать?','Нет.','Добавить управление насосом?','Нет, это другая задача. Оформи только бак.'],'Контроль бака','Уровень строго меньше 83 процентов. Диспетчеру показывать номер бака независимо от уровня. Имя владельца скрывать. Управление насосом не добавлять.')
draft('model-export',['Экспорт модели содержит масштаб и название детали. Формат пока открыт, предлагали STEP.','Примем STEP временно?','Нет, даже временно не утверждён.','Масштаб можно убрать?','Нет, он обязателен.','Что спрашивать?','Только формат экспорта. Оформи.'],'Экспорт модели','В экспорт включать масштаб и название детали. Формат пока не выбран; STEP — только предложение.',['Какой формат экспорта модели выбрать?'])
draft('monitor-refresh',['Монитор показывает количество работающих линий, обновляется раз в 87 секунд. Имена операторов скрыты.','87 оставляем?','Нет, теперь ровно 79 секунд.','Количество линий убрать?','Нет.','Имена показать?','Нет. Составь итоговую задачу.'],'Обновление монитора','Обновлять монитор каждые 79 секунд. Показывать количество работающих линий. Имена операторов скрывать.')
draft('directory-revert',['Раздел «Справочник» переименуем в «База». Значок станет коричневым.','Содержимое и адрес изменять?','Нет.','Переименование сохраняем?','Отменяем, название снова «Справочник».','Цвет вернуть?','Нет, коричневый оставляем. Оформи задачу.'],'Значок справочника','Сделать значок раздела «Справочник» коричневым. Название, содержимое и адрес сохранить.')
draft('two-open',['Карточка станций показывает название текстом и дату осмотра. Цену не показывать.','Цвет названия выбран?','Нет.','Порядок карточек выбран?','Тоже нет.','Дату убрать?','Нет. Подготовь задачу и оставь ровно два вопроса: цвет и порядок карточек.'],'Карточки станций','Показывать название текстом и дату осмотра. Цену скрывать. Цвет названия и порядок карточек пока не выбраны.',['Какой цвет выбрать для названия?','В каком порядке показывать карточки?'])
for id,q,answer,accepted in [
 ('multiply','Ответь только числом: 17 умножить на 14.','238',None),
 ('sort','Верни только JSON-массив: числа 12, 4, 9 по возрастанию.','[4,9,12]',None),
 ('length','Верни только число: len([0, 1, 2, 3, 4, 5]) в Python.','6',None),
 ('literal','Напиши ровно одно слово: Сохранено','Сохранено',None),
 ('expression','Верни только выражение Python, проверяющее, что x больше нуля. Без Markdown.','x > 0',['x > 0','x>0']),
 ('extract','В JSON {"index":27,"text":"Готово"} прочитай index. Ответь только числом.','27',None),
 ('cancellation','Загрузку отменили до её начала. Файл загружен? Ответь только «да» или «нет».','нет',None),
 ('addition','Ответь только числом: 345 плюс 155.','500',None),
]:
 r=dict(id=id,task='general',messages=[dict(role='user',content=q),dict(role='assistant',content=answer)])
 if accepted:r['accepted']=accepted
 rows.append(r)
assert len(rows)==32
seen=[]
for name in ['expanded-train','test','acceptance','confirmation']:seen+=list(map(json.loads,(R/f'{name}.jsonl').read_text().splitlines()))
assert {json.dumps(r['messages'][:-1],ensure_ascii=False) for r in seen}.isdisjoint(json.dumps(r['messages'][:-1],ensure_ascii=False) for r in rows)
p=R/'deep-check.jsonl';p.write_text(''.join(json.dumps(r,ensure_ascii=False)+'\n' for r in rows))
(R/'deep-check-protocol.json').write_text(json.dumps(dict(dataSHA256=hashlib.sha256(p.read_bytes()).hexdigest(),numeric=16,drafts=8,general=8,gate='Numeric and general at least base and v5, strict draft coverage greater than both. No automatic deployment.',novelty='Fresh prompts and numbers, mixed numeric turn lengths, eight long drafts including two open questions. Related synthetic task families, not broad independent benchmark.'),indent=2)+'\n')
