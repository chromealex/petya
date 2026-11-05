"""Promote reviewed errors into supervision and freeze new transfer cases."""
import json
from pathlib import Path
ROOT=Path(__file__).parent
old=[json.loads(s) for s in (ROOT.parent/'requirements-draft-v5/train.jsonl').read_text().splitlines()]
transfer=[json.loads(s) for s in (ROOT.parent/'requirements-transfer-v5/test.jsonl').read_text().splitlines()]
NUM=next(r for r in transfer if r['task']=='bounds')['messages'][0]['content']
DRAFT=next(r for r in transfer if r['task']=='draft')['messages'][0]['content']

def bound(id,target,turns,lo,hi,li,ui):
 m=[dict(role='system',content=NUM),dict(role='user',content=f'Условие: {target}. '+turns[0])]
 for i,t in enumerate(turns[1:]):m.append(dict(role='assistant' if i%2==0 else 'user',content=t))
 assert m[-1]['role']=='user'
 expected=dict(status='open' if lo is None and hi is None else 'final',lower=lo,upper=hi,lowerInclusive=li,upperInclusive=ui)
 m.append(dict(role='assistant',content=json.dumps(expected,ensure_ascii=False)))
 return dict(id=id,topic=id,task='bounds',messages=m)

extra=[]
for i,(note,lo,hi,li,ui) in enumerate([
 ('Температура строго выше минус 3 градусов.',-3,None,False,None),
 ('Температура не выше минус 3 градусов.',None,-3,None,True),
 ('Температура не ниже минус 27 градусов.',-27,None,True,None),
 ('Температура строго ниже минус 27 градусов.',None,-27,None,False),
 ('Температура больше минус 0,5 градуса.',-0.5,None,False,None),
 ('Температура меньше минус 0,5 градуса.',None,-0.5,None,False),
 ('Температура больше минус 3 и не больше 7 градусов.',-3,7,False,True),
 ('Температура не меньше минус 3 и строго меньше 7 градусов.',-3,7,True,False),
]):extra.append(bound(f'correct-negative-{i}','Температура, градусов',[note],lo,hi,li,ui))
for r in transfer:r.update(source='reviewed development case promoted to training')
train=old+transfer+extra
assert len(train)==128
# Pair values and topics differ from the now-training transfer set.
test=[]
for topic,target,initial,variants in [
 ('frost','Температура образца, градусов','Раньше обсуждали минус 9.',[
  ('Теперь строго выше минус 6 градусов.',-6,None,False,None),('Теперь не выше минус 6 градусов.',None,-6,None,True)]),
 ('cold-floor','Температура камеры, градусов','Старое значение минус 20 отменили.',[
  ('Утвердили не ниже минус 17 градусов.',-17,None,True,None),('Утвердили строго ниже минус 17 градусов.',None,-17,None,False)]),
 ('fraction','Давление, бар','Предлагали 5 бар.',[
  ('Теперь давление строго больше 4,5 бар.',4.5,None,False,None),('Теперь давление не больше 4,5 бар.',None,4.5,None,True)]),
 ('cross-zero','Смещение, мм','Прежний диапазон от минус 10 до 10 отменён.',[
  ('Новый диапазон: больше минус 8 и не больше 2 мм.',-8,2,False,True),('Новый диапазон: не меньше минус 8 и меньше 2 мм.',-8,2,True,False)]),
 ('visitors','Число посетителей','Ранее допускалось 300.',[
  ('Теперь допускается строго больше 311.',311,None,False,None),('Теперь допускается не больше 311.',None,311,None,True)]),
 ('settlement','Объём резервуара, литров','Предложили 2,5 литра.',[
  ('Окончательно утвердили ровно 2,5 литра.',2.5,2.5,True,True),('Предложение не утверждено, решение после замера.',None,None,None,None)]),
 ('interval-new','Уровень заряда, процентов','Старый диапазон отменили.',[
  ('Должно быть больше 42 и меньше 79 процентов.',42,79,False,False),('Должно быть от 42 до 79 процентов, включая обе границы.',42,79,True,True)]),
 ('new-cancel','Время продувки, секунд','Согласовали ровно 109 секунд.',[
  ('Это решение отменили, новое время пока не определено.',None,None,None,None),('Заменили срок: теперь ровно 111 секунд.',111,111,True,True)]),
]:
 for i,(decision,lo,hi,li,ui) in enumerate(variants):
  test.append(bound(f'{topic}-{i}',target,[initial,'Какой вариант следует считать действующим?',decision+' Верни норму.'],lo,hi,li,ui))

def draft(id,turns,title,desc,questions=None):
 assert len(turns)==7
 m=[dict(role='system',content=DRAFT)]+[dict(role='user' if i%2==0 else 'assistant',content=t) for i,t in enumerate(turns)]
 m.append(dict(role='assistant',content=json.dumps(dict(summary=title,description=desc,questions=questions or []),ensure_ascii=False)))
 test.append(dict(id=id,topic=id,task='draft',messages=m))

draft('inspection-message',['При неудачной инспекции отправить механику номер инспекции и описание дефекта.','Отправлять при успешной?','Нет, только при неудачной.','Показывать фамилию владельца?','Нет, фамилию скрывать.','Номер дефекта вместо номера инспекции?','Нет, нужен номер инспекции и описание дефекта. Оформи задачу.'],'Сообщение о неудачной инспекции','Только при неудачной инспекции отправлять механику номер инспекции и описание дефекта. Фамилию владельца скрывать. При успешной инспекции не отправлять.')
draft('ticket-print',['Печатать талон: номер места и время сеанса. Имя зрителя не печатать.','Добавить поиск места?','Нет, только печать.','Какой формат времени?','ЧЧ:ММ.','Номер места убрать?','Нет. Составь задачу без поиска и без имени зрителя.'],'Печать талона','Печатать номер места и время сеанса в формате ЧЧ:ММ. Имя зрителя не печатать. Поиск места не добавлять.')
draft('shipment-report',['Отчёт отгрузки отправлять логисту, начальнику не отправлять. Включить номер рейса и итог.','Показывать адрес водителя?','Нет.','Номер рейса заменить?','Да, теперь нужен номер машины вместо номера рейса.','Получателя тоже меняем?','Нет. Составь итоговую задачу.'],'Отчёт отгрузки','Отправлять отчёт логисту, начальнику не отправлять. Включать номер машины и итог. Адрес водителя скрывать.')
draft('screen-revert',['Экран «Склад» переименуем в «Запасы». Кнопки будут белыми.','Содержимое менять?','Нет, содержимое и адрес экрана сохраняются.','Новое название утверждено?','Отменяем переименование. Остаётся «Склад».','А цвет кнопок?','Белый оставляем. Оформи только действующие изменения.'],'Белые кнопки экрана склада','Сделать кнопки экрана «Склад» белыми. Название, содержимое и адрес экрана оставить прежними.')
draft('rotation-scope',['Частота вращения должна быть строго меньше 630 оборотов в минуту. Оператору показывать номер привода.','Только при выполнении этого условия показывать номер?','Нет, номер показывать независимо от частоты.','Какие данные скрывать?','Имя владельца привода.','Внести условия вентиляции?','Нет, это другая задача. Оформи только привод.'],'Контроль привода','Частота вращения строго меньше 630 оборотов в минуту. Оператору показывать номер привода независимо от частоты. Имя владельца скрывать. Вентиляция вне задачи.')
draft('vector-export',['При экспорте схемы включать номер ревизии и единицы измерения. Формат ещё выбираем, предлагали DXF.','Утвердить DXF временно?','Нет, формат не утверждён.','Единицы измерения оставить?','Да, это обязательное поле.','Что спросить?','Только формат. Подготовь задачу.'],'Экспорт схемы','В экспорт включать номер ревизии и единицы измерения. Формат не выбран; DXF — предложение, не временное решение.',['Какой формат экспорта схемы выбрать?'])
draft('dashboard-period',['Табло обновляется каждые 39 секунд, показывает число свободных кабинетов.','Имена пациентов добавлять?','Нет, имена скрыты.','39 секунд оставляем?','Нет, исправляем на ровно 33 секунды.','Что ещё поменять?','Больше ничего. Составь задачу по последнему решению.'],'Обновление табло','Обновлять табло каждые 33 секунды. Показывать число свободных кабинетов. Имена пациентов скрывать.')
draft('parcel-card',['Карточка посылки показывает вес и дату приёма. Стоимость не показываем.','Как показывать вес?','Числом в килограммах.','Цвет веса?','Ещё не выбрали.','Дату убрать?','Нет, дата обязательна. Оформи задачу, оставь вопрос только о цвете.'],'Карточка посылки','Показывать вес числом в килограммах и дату приёма. Стоимость не показывать. Цвет веса пока не выбран.',['Какой цвет использовать для веса?'])
assert len(test)==24
assert len({r['id'] for r in train})==len(train)
assert {r['id'] for r in train}.isdisjoint(r['id'] for r in test)
assert {json.dumps(r['messages'][:-1],ensure_ascii=False) for r in train}.isdisjoint(json.dumps(r['messages'][:-1],ensure_ascii=False) for r in test)
for name,records in [('train',train),('test',test)]:
 (ROOT/f'{name}.jsonl').write_text(''.join(json.dumps(r,ensure_ascii=False)+'\n' for r in records))
# Preserve actual failing outputs beside their reviewed targets, not as supervised text.
actual=json.loads((ROOT.parent/'requirements-transfer-v5/results/adapter.json').read_text())['records']
review=json.loads((ROOT.parent/'requirements-transfer-v5/draft-review.json').read_text())['models']['adapter']
byid={r['id']:r for r in transfer}
corrections=[]
for r in actual:
 failed=not r['passed'] if r['task']=='bounds' else not review[r['id']]['passed']
 if failed:corrections.append(dict(id=r['id'],badAnswer=r['answer'],correctedAnswer=byid[r['id']]['messages'][-1]['content'],source='requirements-transfer-v5',note='Only corrected completion is supervised.'))
(ROOT/'corrections.json').write_text(json.dumps(corrections,ensure_ascii=False,indent=2)+'\n')
print('128 training records, 24 reserved checks,',len(corrections),'reviewed corrections.')
