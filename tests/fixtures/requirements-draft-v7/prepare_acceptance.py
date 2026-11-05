"""Freeze fresh confirmation cases before reading attention-run outputs."""
import hashlib,json
from pathlib import Path
ROOT=Path(__file__).parent
previous=list(map(json.loads,(ROOT/'test.jsonl').read_text().splitlines()))
NUM=next(r for r in previous if r['task']=='bounds')['messages'][0]['content'];DRAFT=next(r for r in previous if r['task']=='draft')['messages'][0]['content']
rows=[]
for id,note,lo,hi,li,ui in [
 ('temp-over','Температура, градусов: строго выше минус 31.',-31,None,False,None),
 ('temp-under','Температура, градусов: строго ниже минус 31.',None,-31,None,False),
 ('temp-min','Температура, градусов: минимум минус 19, граница включена.',-19,None,True,None),
 ('temp-max','Температура, градусов: максимум минус 19, граница включена.',None,-19,None,True),
 ('weight-over','Вес, кг: строго больше 7,5.',7.5,None,False,None),
 ('weight-max','Вес, кг: не больше 7,5.',None,7.5,None,True),
 ('offset-a','Смещение, см: больше минус 4 и не больше 9.',-4,9,False,True),
 ('offset-b','Смещение, см: не меньше минус 4 и меньше 9.',-4,9,True,False),
 ('size-exact','Размер, мм: утвердили ровно 126.',126,126,True,True),
 ('size-open','Размер, мм: решение ровно 126 отменили. Нового решения нет.',None,None,None,None),
 ('count-over','Количество строк: строго больше 517.',517,None,False,None),
 ('count-max','Количество строк: максимум 517.',None,517,None,True),
 ('range-closed','Заряд, процентов: от 49 до 86 включительно с обеих сторон.',49,86,True,True),
 ('range-open','Заряд, процентов: строго больше 49 и строго меньше 86.',49,86,False,False),
 ('proposed','Расстояние, км: предложили 3,75, но пока не утвердили.',None,None,None,None),
 ('confirmed','Расстояние, км: утвердили ровно 3,75.',3.75,3.75,True,True),
]:
 v=dict(status='open' if lo is None and hi is None else 'final',lower=lo,upper=hi,lowerInclusive=li,upperInclusive=ui)
 rows.append(dict(id=id,task='bounds',messages=[dict(role='system',content=NUM),dict(role='user',content=note),dict(role='assistant',content=json.dumps(v,ensure_ascii=False))]))
def draft(id,turns,title,desc,questions=None):
 assert len(turns)%2==1 and len(turns)>=7
 m=[dict(role='system',content=DRAFT)]+[dict(role='user' if i%2==0 else 'assistant',content=x) for i,x in enumerate(turns)]
 m.append(dict(role='assistant',content=json.dumps(dict(summary=title,description=desc,questions=questions or []),ensure_ascii=False)))
 rows.append(dict(id=id,task='draft',messages=m))
draft('label-print',['Нужна задача печати транспортной этикетки: код груза, дата передачи и масса. Телефон отправителя скрыт.','Добавим поиск груза?','Нет, только печать.','Указывать массу?','Да, обязательно.','Дата в каком виде?','ДД/ММ/ГГГГ.','Добавить адрес?','Нет, адрес не нужен. Оформи задачу.'],'Печать транспортной этикетки','Печатать код груза, дату передачи в формате ДД/ММ/ГГГГ и массу. Телефон отправителя скрыть. Поиск груза и адрес не добавлять.')
draft('failed-scan',['Только после неудачного сканирования отправлять архивисту идентификатор сканирования и текст причины.','Имя оператора включать?','Нет, скрыто.','При успехе отправляем?','Нет.','Вместо идентификатора сканирования взять код ошибки?','Нет. Составь задачу с исходными полями.'],'Сообщение о неудачном сканировании','Только после неудачного сканирования отправлять архивисту идентификатор сканирования и текст причины. Имя оператора скрыть. При успехе сообщение не отправлять.')
draft('packing-fields',['Отчёт приёмки нужен снабженцу, управляющему его не отправляем. Поля: код доставки и результат.','Показывать телефон приёмщика?','Нет.','Код доставки оставляем?','Заменить на код склада.','Остальное меняется?','Нет. Сделай задачу.'],'Отчёт приёмки','Отправлять снабженцу код склада и результат приёмки. Управляющему отчёт не отправлять. Телефон приёмщика скрыть.')
draft('motor-reading',['Скорость мотора строго меньше 745 оборотов в минуту. Наладчику показывать номер мотора всегда.','Прятать номер при превышении скорости?','Нет, номер виден независимо от скорости.','Показывать имя клиента?','Нет.','Добавить настройку освещения?','Нет, это отдельная задача. Оформи только мотор.'],'Контроль мотора','Скорость мотора строго меньше 745 оборотов в минуту. Наладчику показывать номер мотора независимо от скорости. Имя клиента скрыть. Настройку освещения не добавлять.')
draft('diagram-format',['Экспорт диаграммы содержит название оси и номер редакции. Формат пока не решили, предлагали EPS.','Записать EPS как временный?','Нет.','Название оси оставить?','Да, это согласовано.','Что уточнять?','Только формат. Составь задачу.'],'Экспорт диаграммы','В экспорт диаграммы включать название оси и номер редакции. Формат пока не согласован; EPS — предложение.',['Какой формат экспорта диаграммы выбрать?'])
draft('queue-refresh',['Сводка показывает количество ожидающих и обновляется каждые 53 секунды. Имена посетителей скрыты.','Оставляем 53 секунды?','Нет, теперь ровно 47.','Изменить количество отображаемых полей?','Нет, всё остальное сохраняем.','Может, показать имена?','Нет. Оформи задачу.'],'Обновление сводки','Обновлять сводку каждые 47 секунд. Показывать количество ожидающих. Имена посетителей скрывать.')
draft('navigation-revert',['Пункт «История» переименуем в «События», иконку сделаем оранжевой.','Адрес и содержимое менять?','Нет.','Новое название оставляем?','Нет, переименование отменено.','Иконку вернуть?','Нет, оранжевая остаётся. Составь итоговую задачу.'],'Иконка пункта истории','Сделать иконку пункта «История» оранжевой. Название, адрес и содержимое сохранить.')
draft('asset-card',['Карточка инструмента показывает название и дату проверки. Закупочную цену скрываем.','Название показывать текстом?','Да.','Какой цвет названия?','Пока не выбран.','Дату убрать?','Нет, дата обязательна. Оформи задачу с вопросом только о цвете.'],'Карточка инструмента','Показывать название текстом и дату проверки. Закупочную цену скрывать. Цвет названия пока не выбран.',['Какой цвет выбрать для названия?'])
for id,q,answer in [
 ('math','Верни только число: 37 умножить на 12.','444'),
 ('ordered','Отсортируй 8, 1, 6 по возрастанию. Верни только JSON-массив.','[1,6,8]'),
 ('python','Чему равно len([2, 4, 6, 8]) в Python? Ответь только числом.','4'),
 ('word','Ответь ровно одним словом: Принято','Принято'),
 ('translate','Переведи на русский: The report is ready. Верни только перевод.','Отчёт готов.'),
 ('json','В объекте {"id":19,"name":"Олег"} прочитай id. Ответь только числом.','19'),
 ('cancel','Отправка сообщения отменена до её начала. Было ли сообщение отправлено? Ответь только «да» или «нет».','нет'),
 ('addition','Верни только число: 225 плюс 175.','400'),
]:rows.append(dict(id=id,task='general',messages=[dict(role='user',content=q),dict(role='assistant',content=answer)]))
assert len(rows)==32
seen=list(map(json.loads,(ROOT/'train.jsonl').read_text().splitlines()))+previous
assert {json.dumps(r['messages'][:-1],ensure_ascii=False) for r in seen}.isdisjoint(json.dumps(r['messages'][:-1],ensure_ascii=False) for r in rows)
p=ROOT/'acceptance.jsonl';p.write_text(''.join(json.dumps(r,ensure_ascii=False)+'\n' for r in rows))
(ROOT/'acceptance-protocol.json').write_text(json.dumps(dict(dataSHA256=hashlib.sha256(p.read_bytes()).hexdigest(),use='New confirmation cases, authored before inspecting query/key experiment outputs. If the experiment fails development gates, reserve these unused. Related synthetic families, not broad independent benchmark.',gate='Numeric and general scores at least base and v5, draft coverage strictly greater than both. No automatic deployment.',translation='Exact output after whitespace trim; ё/е variation alone may additionally be reported as a semantic-only caveat, never silently rescored.'),indent=2)+'\n')
