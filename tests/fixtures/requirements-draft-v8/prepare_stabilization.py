"""Balance direction contrasts and freeze a new confirmation before stabilization."""
import copy,hashlib,json,runpy
from pathlib import Path
R=Path(__file__).parent
# Reuse deterministic constructors; prepare.py only regenerates identical frozen v8 data.
v=runpy.run_path(str(R/'prepare.py'));bounds=v['bounds'];draft=v['draft'];canonical=v['canonical']
read=lambda p:list(map(json.loads(p.read_text().splitlines())))
base=read(R/'train.jsonl');old=[canonical(r) for r in read(R.parent/'requirements-draft-v7/control.jsonl')]
queue=read(R/'next-corrections.jsonl');new=[canonical(dict(id='repair-'+r['id'],task=r['task'],messages=r['messages']+[dict(role='assistant',content=r['chosen'])])) for r in queue]
contrasts=[]
for i,n in enumerate([12,26,48,77]):
 h=['Предыдущий предел отменён.','Какой предел теперь действует?']
 contrasts += [bounds(f'pair-{i}-lt',f'Температура строго ниже минус {n} градусов.',hi=-n,ui=False,history=h),bounds(f'pair-{i}-gt',f'Температура строго выше минус {n} градусов.',lo=-n,li=False,history=h),bounds(f'pair-{i}-le',f'Температура не выше минус {n} градусов.',hi=-n,ui=True,history=h),bounds(f'pair-{i}-ge',f'Температура не ниже минус {n} градусов.',lo=-n,li=True,history=h)]
for i,(lo,hi) in enumerate([(-18,-4),(-9,3),(21,34),(0,15)]):
 contrasts += [bounds(f'interval-{i}-a',f'Значение больше {lo} и не больше {hi}.',lo,hi,False,True),bounds(f'interval-{i}-b',f'Значение не меньше {lo} и меньше {hi}.',lo,hi,True,False),bounds(f'zero-{i}',f'Показатель {i+1}: утвердили ровно ноль.',0,0,True,True),bounds(f'none-{i}',f'Для показателя {i+1} число обсуждали, но ничего не утвердили.')]
train=base+old*8+new*6+contrasts
assert len(train)==520
checks=[]
for i,(id,note,lo,hi,li,ui) in enumerate([
 ('s01','Температура строго выше минус 43 градусов.',-43,None,False,None),
 ('s02','Температура строго ниже минус 43 градусов.',None,-43,None,False),
 ('s03','Температура не ниже минус 86 градусов.',-86,None,True,None),
 ('s04','Температура не выше минус 86 градусов.',None,-86,None,True),
 ('s05','Смещение больше -24 и не больше -7 мм.',-24,-7,False,True),
 ('s06','Смещение не меньше -24 и меньше -7 мм.',-24,-7,True,False),
 ('s07','Допустимо ровно ноль пропусков.',0,0,True,True),
 ('s08','Пока предлагали ноль пропусков, окончательного решения нет.',None,None,None,None),
 ('s09','Масса больше 3,875 кг.',3.875,None,False,None),
 ('s10','Масса не больше 3,875 кг.',None,3.875,None,True),
 ('s11','Период ровно 139 секунд утверждён.',139,139,True,True),
 ('s12','Период 139 секунд отменён, новый не выбран.',None,None,None,None),
 ('s13','Скорость больше 57 и не больше 63 км/ч.',57,63,False,True),
 ('s14','Скорость не меньше 57 и меньше 63 км/ч.',57,63,True,False),
 ('s15','Утвердили строго меньше 947 записей.',None,947,None,False),
 ('s16','Утвердили строго больше 947 записей.',947,None,False,None),
]):
 h=[] if i%2==0 else ['Старое решение отменено.','Какое состояние записать сейчас?']
 checks.append(bounds(id,note,lo,hi,li,ui,h))
checks += [
 draft('s-export',['Выгрузка замеров содержит единицу измерения и код датчика. Формат обсуждается: предложен JSONL.','Можно временно его принять?','Нет, пока ничего не принимаем.','Единицу убрать?','Нет, обязательно оставить.','Какой вопрос открыт?','Только формат выгрузки. Оформи.'],'Выгрузка замеров','Выгружать единицу измерения и код датчика. Формат не утверждён; JSONL — предложение.',['Какой формат выгрузки выбрать?']),
 draft('s-rename',['Раздел «Акты» переименуем в «Документы», значок сделаем бирюзовым.','Менять адрес и содержимое?','Нет.','Отменить новое имя?','Да, остаётся «Акты».','Цвет отменяем?','Нет, бирюзовый оставляем. Оформи.'],'Значок актов','Сделать значок раздела «Акты» бирюзовым. Название, адрес и содержимое сохранить.'),
 draft('s-partial',['Раздел «Рейсы» переименуем в «Поездки», значок станет розовым.','Адрес и содержимое менять?','Нет.','Переименование сохраняем?','Да.','Розовый значок тоже?','Нет, цвет оставляем прежний. Подготовь задачу.'],'Переименование рейсов','Переименовать раздел «Рейсы» в «Поездки». Цвет значка, адрес и содержимое не менять.'),
 draft('s-print',['Печатать билет с номером маршрута, датой поездки и номером места. Телефон пассажира не печатать.','Добавить поиск маршрута?','Нет.','Формат даты?','ДД.ММ.ГГГГ.','Номер места исключить?','Нет, он нужен. Оформи.'],'Печать билета','Печатать номер маршрута, дату поездки в формате ДД.ММ.ГГГГ и номер места. Телефон пассажира не печатать. Поиск маршрута не добавлять.'),
 draft('s-failure',['Только при неудачной загрузке уведомлять редактора: код загрузки и причина.','При удачной загрузке сообщать?','Нет.','Имя автора показывать?','Нет.','Вместо кода загрузки использовать код ошибки?','Нет, сохранить код загрузки. Оформи.'],'Уведомление о неудачной загрузке','Только при неудачной загрузке уведомлять редактора, передавать код загрузки и причину. Имя автора скрывать. При удачной загрузке не уведомлять.'),
 draft('s-report',['Отчёт приёмки отправлять кладовщику, поставщику не отправлять. В нём код поставки и результат.','Адрес перевозчика показать?','Нет.','Код поставки оставить?','Нет, заменить кодом приёмки.','Получателей менять?','Нет. Оформи итог.'],'Отчёт приёмки','Отправлять кладовщику код приёмки и результат. Поставщику не отправлять. Адрес перевозчика скрывать.'),
 draft('s-open',['Карточка тренажёра показывает название текстом и дату обслуживания. Стоимость скрывать.','Цвет названия утверждён?','Нет.','Размер карточки выбран?','Нет.','Дату оставить?','Да. Оформи задачу с двумя вопросами: цвет и размер.'],'Карточки тренажёров','Показывать название текстом и дату обслуживания. Стоимость скрывать. Цвет названия и размер карточки не выбраны.',['Какой цвет названия выбрать?','Какой размер карточки выбрать?']),
 draft('s-refresh',['На экране число активных датчиков. Обновление раз в 121 секунду. Имена инженеров скрывать.','Интервал оставить?','Нет, теперь 103 секунды.','Число датчиков убрать?','Нет.','Имена показать?','Нет. Оформи.'],'Обновление экрана','Показывать число активных датчиков, обновлять экран каждые 103 секунды. Имена инженеров скрывать.'),
]
for i,q,a in [
 (1,'Ответь только числом: 21 умножить на 16.','336'),(2,'Верни только JSON-массив чисел 14, -7, 2 по возрастанию.','[-7,2,14]'),(3,'Ответь только числом: len([3, 7, 9]) в Python.','3'),(4,'Напиши ровно слово: Проверено','Проверено'),(5,'Ответь только числом: 93 минус 28.','65'),(6,'Прочитай n из JSON {"n":58,"ok":true}. Ответь только числом.','58'),(7,'Отправку отменили до начала. Сообщение отправлено? Ответь только «да» или «нет».','нет'),(8,'Ответь только числом: 214 плюс 186.','400')]:
 checks.append(dict(id=f'sg{i}',task='general',messages=[dict(role='user',content=q),dict(role='assistant',content=a)]))
sig=lambda x:json.dumps(x['messages'][:-1],ensure_ascii=False,sort_keys=True)
oldprompts=[]
for p in R.parent.glob('requirements-draft-*/*.jsonl'):
 if p.name in ['stabilization-train.jsonl','confirmation.jsonl']:continue
 for x in read(p):
  if 'messages' in x and x['messages'][-1]['role']=='assistant':oldprompts.append(x)
assert set(map(sig,checks)).isdisjoint(map(sig,oldprompts+train))
assert len(checks)==32 and len(set(map(sig,checks)))==32
hashes={}
for name,rows in [('stabilization-train.jsonl',train),('confirmation.jsonl',checks)]:
 p=R/name;p.write_text(''.join(json.dumps(x,ensure_ascii=False)+'\n' for x in rows));hashes[name]=hashlib.sha256(p.read_bytes()).hexdigest()
(R/'stabilization-protocol.json').write_text(json.dumps(dict(hashes=hashes,parent='adapter',epochs=1,lr=0.00002,layers=5,steps=520,selection='Fixed one-pass stabilization before new confirmation inference.',reason='Initial v8 acquired 7/7 but regressed on an older negative lower bound. Add balanced directional/interval/zero contrasts, original eight corrections and the ten newly observed failures.',gate='All seven current and eight original corrections semantically correct; new numeric and general at least v7 and base; new complete drafts greater than v7 and base. Report comparison to initial v8 too. Release requires all targeted checks and broader validation.',limitations='Synthetic related task families; manual non-blind semantic draft review; no production change.'),indent=2)+'\n')
print('Prepared 520 stabilization rows and 32 new reserved checks.')
