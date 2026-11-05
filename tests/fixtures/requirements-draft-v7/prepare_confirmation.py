"""Freeze a fresh confirmation set for the expanded SFT candidate."""
import hashlib,json
from pathlib import Path
R=Path(__file__).parent
old=list(map(json.loads,(R/'test.jsonl').read_text().splitlines()))
NUM=next(x for x in old if x['task']=='bounds')['messages'][0]['content'];DRAFT=next(x for x in old if x['task']=='draft')['messages'][0]['content']
rows=[]
def numeric(id,target,earlier,final,lo,hi,li,ui):
 v=dict(status='open' if lo is None and hi is None else 'final',lower=lo,upper=hi,lowerInclusive=li,upperInclusive=ui)
 rows.append(dict(id=id,task='bounds',messages=[dict(role='system',content=NUM),dict(role='user',content=target+'. '+earlier),dict(role='assistant',content='Какое решение сейчас действует?'),dict(role='user',content=final+' Выдели норму.'),dict(role='assistant',content=json.dumps(v,ensure_ascii=False))]))
for topic,target,number,spelling,earlier in [
 ('voltage','Напряжение, вольт',-2.25,'-2,25','В старой записи было -3.'),
 ('freezer','Температура, градусов',-46,'минус 46','Ранее предлагали минус 50.'),
 ('tolerance','Допуск, мм',5.125,'5,125','Прежняя норма 5 отменена.'),
]:
 for suffix,text,lo,hi,li,ui in [('gt','строго больше',number,None,False,None),('ge','не меньше',number,None,True,None),('lt','строго меньше',None,number,None,False),('le','не больше',None,number,None,True)]:numeric(topic+'-'+suffix,target,earlier,f'Утвердили {text} {spelling}.',lo,hi,li,ui)
for id,text,li,ui in [('closed','От -11 до 6 включительно с обеих сторон.',True,True),('open','Строго больше -11 и строго меньше 6.',False,False),('left-open','Больше -11, но не больше 6.',False,True),('right-open','Не меньше -11, но меньше 6.',True,False)]:numeric('interval-'+id,'Отклонение, см','Старый диапазон от -20 до 20 отменён.',text,-11,6,li,ui)
for id,earlier,decision,lo,hi,li,ui in [
 ('duration-exact','Предложили 143 секунды.','Утвердили ровно 143 секунды.',143,143,True,True),
 ('duration-proposal','Предложили 143 секунды.','Предложение не принято, решение будет позже.',None,None,None,None),
 ('duration-revoke','Утвердили ровно 143 секунды.','Это решение отменили; новый срок не выбран.',None,None,None,None),
 ('duration-change','Утвердили ровно 143 секунды.','Отменили старое, утвердили ровно 149 секунд.',149,149,True,True),
]:numeric(id,'Время выдержки, секунд',earlier,decision,lo,hi,li,ui)
for id,text,lo,hi,li,ui in [('gt','Строго больше 613.',613,None,False,None),('le','Не больше 613.',None,613,None,True),('min','Только минимум 620, максимум не задан.',620,None,True,None),('max','Только максимум 605, минимум не задан.',None,605,None,True)]:numeric('quota-'+id,'Количество записей','Старый диапазон 500–700 отменили.',text,lo,hi,li,ui)
def draft(id,turns,title,desc,questions=None):
 assert len(turns)%2==1 and len(turns)>=7
 m=[dict(role='system',content=DRAFT)]+[dict(role='user' if i%2==0 else 'assistant',content=t) for i,t in enumerate(turns)]
 m.append(dict(role='assistant',content=json.dumps(dict(summary=title,description=desc,questions=questions or []),ensure_ascii=False)))
 rows.append(dict(id=id,task='draft',messages=m))
draft('part-passport',['Печатаем паспорт детали: артикул, дата сборки, количество. Имя сборщика не выводим.','Нужен поиск по артикулу?','Нет.','Дата в каком виде?','ГГГГ/ММ/ДД.','Количество печатать?','Да, оно обязательно. Составь задачу только печати.'],'Печать паспорта детали','Печатать артикул, дату сборки в формате ГГГГ/ММ/ДД и количество. Имя сборщика не выводить. Поиск по артикулу не добавлять.')
draft('failed-measure',['При неудачном замере уведомлять метролога. Передавать идентификатор замера и объяснение причины.','А при успешном?','Не уведомлять.','Фамилию исполнителя показывать?','Нет.','Код причины вместо идентификатора замера?','Нет. Оформи исходные поля без подмены.'],'Уведомление о неудачном замере','Только при неудачном замере уведомлять метролога, передавать идентификатор замера и объяснение причины. Фамилию исполнителя скрывать. При успешном замере не уведомлять.')
draft('warehouse-report',['Сводка возвратов отправляется товароведу, владельцу магазина не отправлять. Поля: номер возврата и результат.','Показывать телефон кассира?','Нет.','Номер возврата остаётся?','Заменяем на номер акта.','Получатели меняются?','Нет, подготовь задачу.'],'Сводка возвратов','Отправлять товароведу номер акта и результат возврата. Владельцу магазина не отправлять. Телефон кассира скрывать.')
draft('humidity-display',['Влажность должна быть строго меньше 68 процентов. Контролёр всегда видит номер камеры.','Если влажность выше, скрывать номер?','Нет, номер виден независимо от влажности.','Имя арендатора видно?','Нет.','Добавить управление дверью?','Нет, это другая задача. Составь задачу камеры.'],'Контроль камеры','Влажность строго меньше 68 процентов. Контролёру показывать номер камеры независимо от влажности. Имя арендатора скрывать. Управление дверью не добавлять.')
draft('network-export',['В экспорт сети включить количество узлов и номер схемы. Формат не выбран, предложили GraphML.','Считать GraphML временным решением?','Нет.','Количество узлов убрать?','Нет, оно согласовано.','Какой вопрос оставить?','Только формат экспорта. Оформи задачу.'],'Экспорт сети','В экспорт сети включать количество узлов и номер схемы. Формат не согласован; GraphML — предложение.',['Какой формат экспорта сети выбрать?'])
draft('progress-refresh',['Панель показывает число завершённых заданий и обновляется каждые 77 секунд. Имена исполнителей скрыты.','Оставляем 77 секунд?','Нет, теперь ровно 69.','Убрать число заданий?','Нет.','Показывать имена?','Нет. Составь задачу по последнему решению.'],'Обновление панели заданий','Обновлять панель каждые 69 секунд. Показывать число завершённых заданий. Имена исполнителей скрывать.')
draft('catalog-revert',['Вкладку «Каталог» переименуем в «Ассортимент». Значок будет бирюзовым.','Содержимое и адрес менять?','Нет.','Новое название утверждено?','Отменяем переименование, остаётся «Каталог».','Значок вернуть прежним?','Нет, бирюзовый оставляем. Составь итоговую задачу.'],'Значок каталога','Сделать значок вкладки «Каталог» бирюзовым. Название, содержимое и адрес не менять.')
draft('machine-card',['Карточка станка показывает режим и дату обслуживания. Инвентарную стоимость скрываем.','Режим выводить текстом?','Да, именно текстом.','Какого цвета?','Цвет пока не выбрали.','Дату оставить?','Да, она обязательна. Оформи с вопросом только о цвете.'],'Карточка станка','Показывать режим текстом и дату обслуживания. Инвентарную стоимость скрывать. Цвет режима ещё не выбран.',['Какой цвет использовать для режима?'])
for id,q,answer in [
 ('product','Ответь только числом: 19 умножить на 13.','247'),
 ('list','Отсортируй числа 7, 3, 10 по возрастанию. Верни только JSON-массив.','[3,7,10]'),
 ('length','Чему равно len((1, 2, 3, 4, 5)) в Python? Верни только число.','5'),
 ('copy-word','Ответь ровно одним словом: Записано','Записано'),
 ('translate','Переведи на русский: The task is complete. Верни только перевод.','Задача выполнена.'),
 ('extract','Из объекта {"code":21,"title":"Склад"} прочитай code. Ответь только числом.','21'),
 ('cancelled','Пользователь отменил публикацию до её начала. Публикация состоялась? Ответь только «да» или «нет».','нет'),
 ('addition','Ответь только числом: 320 плюс 180.','500'),
]:
 row=dict(id=id,task='general',messages=[dict(role='user',content=q),dict(role='assistant',content=answer)])
 if id=='translate':row['accepted']=['Задача выполнена.','Задача завершена.']
 rows.append(row)
assert len(rows)==40
seen=[]
for name in ['train','test','acceptance']:seen+=list(map(json.loads,(R/f'{name}.jsonl').read_text().splitlines()))
assert {json.dumps(r['messages'][:-1],ensure_ascii=False) for r in seen}.isdisjoint(json.dumps(r['messages'][:-1],ensure_ascii=False) for r in rows)
p=R/'confirmation.jsonl';p.write_text(''.join(json.dumps(r,ensure_ascii=False)+'\n' for r in rows))
(R/'confirmation-protocol.json').write_text(json.dumps(dict(dataSHA256=hashlib.sha256(p.read_bytes()).hexdigest(),numeric=24,drafts=8,general=8,translation='Two semantically equivalent Russian translations explicitly accepted before inference. Other constrained general outputs exact.',use='Fresh confirmation for expanded ordinary SFT; freeze before inspecting that candidate. Related synthetic families, not production proof.',gate='Numeric and general at least base and v5; strict draft coverage greater than both; no automatic deployment.'),indent=2)+'\n')
