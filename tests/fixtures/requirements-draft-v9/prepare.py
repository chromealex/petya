"""Prepare balanced decision contrasts, retention replay, and frozen new dialogs."""
import copy,hashlib,json
from pathlib import Path
R=Path(__file__).parent;OLD=R.parent/'requirements-draft-v8'
def read(p):return list(map(json.loads,p.read_text().splitlines()))
def canonical(row):
 row=copy.deepcopy(row)
 try:v=json.loads(row['messages'][-1]['content'])
 except ValueError:return row
 if row['task']=='draft':v={k:v[k] for k in ['description','questions','summary']}
 row['messages'][-1]['content']=json.dumps(v,ensure_ascii=False,separators=(',',':'));return row
def signature(row):return json.dumps(row['messages'][:-1],ensure_ascii=False,sort_keys=True)
old=read(OLD/'stabilization-train.jsonl');NUM=next(r for r in old if r['task']=='bounds')['messages'][0]['content'];DRAFT=next(r for r in old if r['task']=='draft')['messages'][0]['content']
def example(id,task,turns,result,system=None):
 assert len(turns)%2==1
 messages=([dict(role='system',content=system)] if system else [])+[dict(role='user' if i%2==0 else 'assistant',content=t) for i,t in enumerate(turns)]
 messages.append(dict(role='assistant',content=json.dumps(result,ensure_ascii=False)))
 return canonical(dict(id=id,task=task,messages=messages))
def draft(id,turns,desc,title,questions=None):return example(id,'draft',turns,dict(description=desc,questions=questions or [],summary=title),DRAFT)
def bounds(id,note,lo,hi,li,ui,history=None):return example(id,'bounds',(history or [])+[note],dict(status='open' if lo is None and hi is None else 'final',lower=lo,upper=hi,lowerInclusive=li,upperInclusive=ui),NUM)
fixes=[canonical(dict(id='fix-'+q['id'],task=q['task'],messages=q['messages']+[dict(role='assistant',content=q['chosen'])])) for q in read(OLD/'remaining-corrections.jsonl')]
retention=[canonical(r) for r in read(OLD/'acquisition.jsonl')]
variants=[]
for i,(name,new,color) in enumerate([('Заметки','Записи','белым'),('Счета','Платежи','чёрным'),('Материалы','Склад','красным'),('Планы','Графики','салатовым')]):
 for keep_name in [False,True]:
  for keep_color in [False,True]:
   turns=[f'Раздел «{name}» переименовать в «{new}», значок сделать {color}.','Адрес и содержимое менять?','Нет, оба сохранить.','Отменить переименование?',f'Нет, новое имя «{new}» оставляем.' if keep_name else f'Да, остаётся прежнее имя «{name}».','А изменение цвета отменить?','Нет, цвет меняем, как договорились.' if keep_color else 'Да, цвет значка остаётся прежним. Оформи итог.']
   desc=(f'Переименовать «{name}» в «{new}». ' if keep_name else f'Сохранить название «{name}». ')+(f'Сделать значок {color}. ' if keep_color else 'Цвет значка не менять. ')+'Адрес и содержимое не менять.'
   variants.append(draft(f'rename-{i}-{int(keep_name)}{int(keep_color)}',turns,desc,f'Изменения раздела «{name}»'))
for i,(owner,other,field,oldcode,newcode) in enumerate([('менеджеру','клиенту','телефон водителя','код заказа','код рейса'),('контролёру','подрядчику','адрес мастера','код заявки','код осмотра'),('оператору','автору','имя проверяющего','код записи','код проверки'),('администратору','посетителю','почту сотрудника','код обращения','код брони')]):
 for add_recipient in [False,True]:
  for reveal in [False,True]:
   turns=[f'Отчёт отправлять {owner}, {other} не отправлять. В нём {oldcode} и результат. Скрывать {field}.',f'Заменить {oldcode} на {newcode}?','Да.','Поменять получателей?',f'Да, теперь отправлять также {other}.' if add_recipient else 'Нет, запрет оставить.',f'Показывать {field}?','Да, прежний запрет снимаем.' if reveal else 'Нет, скрывать.','Результат убрать?','Нет. Оформи задачу.']
   desc=f'Отправлять {owner} {newcode} и результат. '+(f'Также отправлять {other}. ' if add_recipient else f'{other.capitalize()} не отправлять. ')+(f'Показывать {field}.' if reveal else f'Скрывать {field}.')
   variants.append(draft(f'report-{i}-{int(add_recipient)}{int(reveal)}',turns,desc,'Отчёт с согласованными полями и получателями'))
for i,(lo,hi) in enumerate([(-31,-8),(-56,-19),(-5,8),(4,29)]):
 for li in [False,True]:
  for ui in [False,True]:
   variants.append(bounds(f'range-{i}-{int(li)}{int(ui)}',f'Значение {"не меньше" if li else "больше"} {lo} и {"не больше" if ui else "меньше"} {hi}.',lo,hi,li,ui))
for i,values in enumerate([[13,-6,4],[8,-3,11],[0,17,-9],[25,2,-14],[7,-1,7],[3,0,-5],[18,-12,6],[9,-4,1]]):
 for reverse in [False,True]:
  variants.append(example(f'sort-{i}-{int(reverse)}','general',[f'Верни только JSON-массив: {", ".join(map(str,values))} по {"убыванию" if reverse else "возрастанию"}.'],sorted(values,reverse=reverse)))
assert len(variants)==64
unique={signature(r):canonical(r) for r in old}
train=list(unique.values())+retention*4+fixes*12+variants*2
checks=[];rubric={}
def check(row,criteria,pair=None):
 checks.append(row)
 if row['task']=='draft':rubric[row['id']]=dict(criteria=criteria,pair=pair)
# Four controlled decisions: same setup, only the final decisions differ.
for keep_name,keep_color in [(False,True),(True,False),(False,False),(True,True)]:
 id=f'cancel-{int(keep_name)}{int(keep_color)}'
 turns=['Раздел «Проверки» назовём «Инспекции», значок станет бордовым.','Данные и адрес тоже менять?','Нет.','Отменяем новое название?','Нет, оставляем «Инспекции».' if keep_name else 'Да, вернём «Проверки».','А бордовый цвет отменяем?','Нет, бордовый нужен. Составь итог.' if keep_color else 'Да, цвет не меняем. Составь итог.']
 desc=('Переименовать «Проверки» в «Инспекции». ' if keep_name else 'Сохранить название «Проверки». ')+('Сделать значок бордовым. ' if keep_color else 'Цвет значка не менять. ')+'Данные и адрес сохранить.'
 check(draft(id,turns,desc,'Изменения раздела проверок'),[f'Rename active: {keep_name}',f'Color change active: {keep_color}','Address and data preserved'],'rename-four-way')
for allow,reveal in [(False,False),(True,False),(False,True),(True,True)]:
 id=f'ban-{int(allow)}{int(reveal)}'
 turns=['Отчёт возврата отправлять кассиру, покупателю не отправлять. В нём номер чека и итог. Номер телефона курьера скрывать.','Номер чека заменяем номером возврата?','Да.','Добавить покупателя к получателям?','Да, теперь ему тоже отправлять.' if allow else 'Нет, не добавлять.','Телефон курьера теперь показать?','Да, скрытие отменяем.' if reveal else 'Нет, по-прежнему скрывать.','Итог исключить?','Нет. Оформи задачу.']
 desc='Отправлять кассиру номер возврата и итог. '+('Также отправлять покупателю. ' if allow else 'Покупателю не отправлять. ')+('Показывать телефон курьера.' if reveal else 'Телефон курьера скрывать.')
 check(draft(id,turns,desc,'Отчёт возврата'),['Cashier recipient and return number/result',f'Buyer allowed: {allow}',f'Courier phone visible: {reveal}'],'recipient-field-four-way')
check(draft('topic-return',['В уведомлении диспетчеру нужны номер смены и время начала. Фамилию сотрудника скрывать.','А график отпусков?','Он отдельной задачей, вернёмся к уведомлению.','Время заменить датой?','Нет, оставить время ЧЧ:ММ.','Фамилию всё-таки показать?','Нет. Подготовь только уведомление.'],'Уведомлять диспетчера: номер смены и время начала в формате ЧЧ:ММ. Фамилию сотрудника скрывать. График отпусков не включать.','Уведомление о смене'),['Dispatcher, shift number, start time HH:MM','Hidden surname','Vacation schedule excluded'])
check(draft('double-cancel',['Переименовать «Резерв» в «Запасы». Значок синий, адрес прежний.','Переименование оставляем?','Нет, отменяем.','Синий отменить?','Да, цвет прежний.','Вернуть идею нового имени?','Да, всё-таки «Запасы».','Адрес менять?','Нет. Оформи последнюю версию.'],'Переименовать «Резерв» в «Запасы». Цвет значка и адрес не менять.','Переименование резерва'),['Latest rename active after two reversals','Color and address unchanged'])
check(draft('print-fields',['Печатать квитанцию: номер операции, дата оплаты, название кассы. ФИО плательщика не печатать.','Поиск операции добавить?','Нет.','Формат даты?','ГГГГ/ММ/ДД.','Название кассы убрать?','Нет, сохранить. Оформи.'],'Печатать номер операции, дату оплаты в формате ГГГГ/ММ/ДД и название кассы. ФИО плательщика не печатать. Поиск операции не добавлять.','Печать квитанции'),['All three fields and exact date format','No payer name','No search'])
check(draft('notify-only',['При неудачной отправке уведомлять секретаря: номер письма и причина. При успехе не уведомлять.','Имя отправителя показывать?','Нет.','Номер письма заменить кодом сбоя?','Нет, нужен номер письма. Подготовь задачу.'],'Только при неудачной отправке уведомлять секретаря, передавать номер письма и причину. Имя отправителя скрывать. При успехе не уведомлять.','Уведомление о неудачной отправке'),['Secretary only on failure','Letter number not error code; cause','Sender name hidden'])
check(draft('open-questions',['Карточки приборов: название текстом и срок поверки. Стоимость скрывать.','Цвет названия?','Ещё не выбран.','Порядок приборов?','Тоже не выбран.','Срок убрать?','Нет. Оформи с двумя вопросами: цвет и порядок.'],'Показывать название текстом и срок поверки. Стоимость скрывать. Цвет названия и порядок приборов не выбраны.','Карточки приборов',['Какой цвет названия выбрать?','Какой порядок приборов выбрать?']),['Text name and verification deadline','Hidden cost','Only color and order questions'])
check(draft('closed-question',['Экспорт списка включает название и категорию. Формат пока открыт, предложен TSV.','Утверждаем TSV?','Да.','Категорию исключить?','Нет.','Оставить вопрос про формат?','Нет, он решён. Подготовь задачу.'],'Экспортировать название и категорию в утверждённом формате TSV.','Экспорт списка'),['Name/category and approved TSV','No reopened format question'])
check(draft('pronoun',['В отчёте показывать номер партии и результат. Адрес склада скрывать.','Номер партии оставляем?','Да.','А адрес?','Его тоже не показывать, как договорились.','Результат убрать?','Нет. Оформи.'],'Показывать номер партии и результат. Адрес склада скрывать.','Поля отчёта'),['Batch number and result','Address remains hidden despite follow-up pronoun'])
check(draft('repeat-correction',['Панель показывает число заявок, имена клиентов скрыты. Обновление раз в 146 секунд.','146 секунд?','Нет, 127.','Точно 146?','Нет, я исправил: 127 секунд.','Имена можно показать?','Нет. Оформи.'],'Показывать число заявок, обновлять каждые 127 секунд. Имена клиентов скрывать.','Обновление панели'),['127 seconds not repeated stale 146','Count visible and names hidden'])
for i,(note,lo,hi,li,ui) in enumerate([
 ('Смещение не меньше -37 и меньше -16 мм.',-37,-16,True,False),('Смещение больше -37 и не больше -16 мм.',-37,-16,False,True),
 ('Температура строго выше -63 градусов.',-63,None,False,None),('Температура строго ниже -63 градусов.',None,-63,None,False),
 ('Температура не выше -94 градусов.',None,-94,None,True),('Температура не ниже -94 градусов.',-94,None,True,None),
 ('Необходимо ровно ноль повторных отправок.',0,0,True,True),('Ноль повторов предлагали, но норму отложили.',None,None,None,None),
 ('Период 173 секунды отменён. Нового решения нет.',None,None,None,None),('Утвердили период ровно 173 секунды.',173,173,True,True),
 ('Масса больше 7,625 и не больше 9,25 кг.',7.625,9.25,False,True),('Масса не меньше 7,625 и меньше 9,25 кг.',7.625,9.25,True,False),
 ('Строго больше 983 строк.',983,None,False,None),('Не больше 983 строк.',None,983,None,True),
 ('Диапазон от -2,5 до 4,125 включительно.',-2.5,4.125,True,True),('Больше -2,5 и меньше 4,125.',-2.5,4.125,False,False),
]):
 h=['Прежние нормы больше не действуют.','Что записать вместо них?'] if i%2 else []
 check(bounds(f'n{i+1:02}',note,lo,hi,li,ui,h),[])
for id,question,answer in [
 ('g-sort','Верни только JSON-массив чисел 23, -8, 6 по возрастанию.',[-8,6,23]),
 ('g-sort-desc','Верни только JSON-массив чисел -11, 4, 19 по убыванию.',[19,4,-11]),
 ('g-duplicate','Отсортируй 5, -2, 5, 0 по возрастанию. Ответ — только JSON-массив.',[-2,0,5,5]),
 ('g-product','Ответь только числом: 18 умножить на 12.',216),
 ('g-length','Верни только число: len([1, 3, 5, 7, 9]) в Python.',5),
 ('g-extract','В JSON {"count":64,"name":"Готово"} прочитай count. Ответь только числом.',64),
 ('g-zero','Ответь только числом: 48 минус 48.',0),
 ('g-sum','Ответь только числом: 237 плюс 163.',400),
]:check(example(id,'general',[question],answer),[])
assert len(checks)==40 and len(rubric)==16
prior=[]
for p in R.parent.glob('requirements-draft-*/*.jsonl'):
 if p.parent==R:continue
 for row in read(p):
  if 'messages' in row and row['messages'][-1]['role']=='assistant':prior.append(row)
assert set(map(signature,checks)).isdisjoint(map(signature,prior+train))
assert len(set(map(signature,checks)))==len(checks)
acquisition=retention+fixes
assert len(acquisition)==30
hashes={}
for name,rows in [('train.jsonl',train),('new-corrections.jsonl',fixes),('variants.jsonl',variants),('retention.jsonl',retention),('acquisition.jsonl',acquisition),('check.jsonl',checks)]:
 p=R/name;p.write_text(''.join(json.dumps(x,ensure_ascii=False)+'\n' for x in rows));hashes[name]=hashlib.sha256(p.read_bytes()).hexdigest()
(R/'rubric.json').write_text(json.dumps(dict(global_rule='Valid schema and all agreed requirements; preserve explicit exclusions, retain latest decisions, no invented requirements or reopened questions. Accept equivalent wording. Manual non-blind review.',cases=rubric),indent=2)+'\n')
(R/'protocol.json').write_text(json.dumps(dict(hashes=hashes,parent='../requirements-draft-v8/stabilized-adapter',epochs=1,learning_rate=0.00002,layers=5,seed=42,rows=len(train),distinct_training_prompts=len(set(map(signature,train))),steps=len(train),selection='One fixed candidate, no selection on reserved checks.',gate='All 30 acquired examples semantically correct after reload; new draft coverage greater than base and parent, no numeric/general regression; every cancellation/ban contrast must be reviewed individually. Full reliability requires all targeted cases, not only score improvement.',limits='Synthetic related families; manual non-blind review; no production changes or automatic release.'),indent=2)+'\n')
print('Prepared',len(train),'training rows, 30 acquisition targets and 40 reserved cases.')
