"""Freeze exact-label, independent-decision and retention training/checks."""
import copy,hashlib,json,random
from pathlib import Path
R=Path(__file__).parent;OLD=R.parent/'requirements-draft-v10'
def read(p):return list(map(json.loads,p.read_text().splitlines()))
def sig(r):return json.dumps(r['messages'][:-1],sort_keys=True,ensure_ascii=False)
def canon(r):
 r=copy.deepcopy(r)
 try:v=json.loads(r['messages'][-1]['content'])
 except ValueError:return r
 if r['task']=='draft':v={k:v[k] for k in ['description','questions','summary']}
 r['messages'][-1]['content']=json.dumps(v,ensure_ascii=False,separators=(',',':'));return r
prior=read(OLD/'repair-acquisition.jsonl')
fixes=[canon(dict(id='v11-'+q['id'],task=q['task'],messages=q['messages']+[dict(role='assistant',content=q['chosen'])])) for q in read(OLD/'remaining-corrections.jsonl')]
oldrows=read(OLD/'train.jsonl');NUM=next(x for x in oldrows if x['task']=='bounds')['messages'][0]['content'];DRAFT=next(x for x in oldrows if x['task']=='draft')['messages'][0]['content']
def ex(id,task,turns,v,system=None):
 assert len(turns)%2==1
 m=([dict(role='system',content=system)] if system else [])+[dict(role='user' if i%2==0 else 'assistant',content=t) for i,t in enumerate(turns)]
 m.append(dict(role='assistant',content=json.dumps(v,ensure_ascii=False)));return canon(dict(id=id,task=task,messages=m))
def draft(id,turns,desc,title,qs=None,literals=None):
 r=ex(id,'draft',turns,dict(description=desc,questions=qs or [],summary=title),DRAFT)
 if literals:r['required_literals']=literals
 return r
variants=[]
labels=[('Договора','Контракты','серым'),('Счёты','Расчёты','синим'),('Пропуски','Отсутствия','белым'),('Пропуска','Допуски','чёрным'),('Акты-04','Документы-04','красным'),('Реестр №09','Список №09','зелёным'),('Склад-А','Склад-Б','жёлтым'),('Заказ_01','Заявка_01','оранжевым')]
for i,(old,new,color) in enumerate(labels):
 for name,color_on in [(False,True),(True,False),(False,False),(True,True)]:
  pairs=[('Отменяем новое имя?',f'Нет, нужно «{new}».' if name else f'Да, сохраняем «{old}».'),('Цвет меняем?',f'Да, делаем значок {color}.' if color_on else 'Нет, цвет прежний.')]
  if i%2:pairs.reverse()
  turns=[f'Раздел «{old}» переименуем в «{new}», значок сделаем {color}. Адрес и содержимое не менять.']
  for q,a in pairs:turns += [q,a]
  turns += ['Адрес и содержимое сохранить?','Да. Оформи итог.']
  desc=(f'Переименовать «{old}» в «{new}». ' if name else f'Название «{old}» сохранить. ')+(f'Значок сделать {color}. ' if color_on else 'Цвет значка не менять. ')+'Адрес и содержимое сохранить.'
  variants.append(draft(f'label-{i}-{int(name)}{int(color_on)}',turns,desc,f'Раздел «{old}»',literals=[old]+([new] if name else [])))
for i,(main,other,hidden,oldcode,newcode) in enumerate([('бухгалтеру','покупателю','телефон кассира','код чека','код возврата'),('инспектору','подрядчику','почту мастера','номер заявки','номер акта'),('диспетчеру','водителю','адрес клиента','код заказа','код рейса'),('редактору','автору','имя корректора','номер текста','номер версии')]):
 for allowed,shown in [(False,False),(True,False),(False,True),(True,True)]:
  turns=[f'Отчёт отправлять {main}, {other} не отправлять. В отчёте {oldcode} и результат. Скрывать {hidden}.',f'Заменить {oldcode} на {newcode}?','Да.',f'Разрешить отправку {other}?','Да, запрет снимаем.' if allowed else 'Нет, запрет сохраняем.',f'Показывать {hidden}?','Да, скрытие отменяем.' if shown else 'Нет, скрывать.','Обоим получателям одинаковый отчёт?' if allowed else 'Результат оставляем?','Да. Оформи.']
  desc=f'Отчёт с полями «{newcode}» и «результат» отправлять {main}'+(f' и {other}. ' if allowed else f'. {other.capitalize()} не отправлять. ')+(f'Показывать {hidden}.' if shown else f'Скрывать {hidden}.')
  variants.append(draft(f'full-report-{i}-{int(allowed)}{int(shown)}',turns,desc,'Отправка полного отчёта'))
for i,(who,code,date,scope) in enumerate([('секретарю','номер письма','дату регистрации','заказ бумаги'),('архивариусу','номер папки','дату сдачи','покупку шкафов'),('диспетчеру','номер смены','дату начала','ремонт панели'),('инспектору','номер участка','дату проверки','ремонт дороги'),('врачу','номер заявки','дату приёма','закупку оборудования'),('куратору','номер группы','дату занятия','аренду зала'),('оператору','номер линии','дату запуска','монтаж кабеля'),('мастеру','номер наряда','дату работы','покупку инструмента')]):
  turns=[f'Сообщение {who}: {code} и {date}. Имя клиента скрывать.',f'Добавить {scope}?','Нет, это отдельная задача.','Какой формат даты?','ДД.ММ.ГГГГ.','Имя показать?','Нет. Оформи только сообщение.']
  variants.append(draft(f'scope-{i}',turns,f'Отправлять {who} {code} и {date} в формате ДД.ММ.ГГГГ. Имя клиента скрывать. Задачу про {scope} не включать.','Сообщение с согласованными полями'))
for i,(correct,wrong) in enumerate([('Договора','Договоры'),('Счёты','Счета'),('Акты-04','Акты-4'),('Реестр №09','Реестр №9'),('Заказ_01','Заказ-01'),('Склад-А','Склад А'),('Пропуска','Пропуски'),('Листы-08','Листы-8')]):
  turns=[f'У раздела «{correct}» сделать значок фиолетовым. Название и адрес не менять.',f'Записать название «{wrong}»?',f'Нет, точное название «{correct}».','Содержимое менять?','Нет. Оформи задачу.']
  variants.append(draft(f'copy-{i}',turns,f'Сделать значок раздела «{correct}» фиолетовым. Название «{correct}», адрес и содержимое не менять.',f'Значок «{correct}»',literals=[correct]))
assert len(variants)==64
# Fixed, seeded general/numeric rehearsal without consulting new-case outputs.
unique={sig(x):x for x in oldrows};rng=random.Random(42)
nums=[x for x in unique.values() if x['task']=='bounds'];general=[x for x in unique.values() if x['task']=='general']
rehearsal=rng.sample(nums,16)+rng.sample(general,16)
train=prior*4+fixes*16+variants*2+rehearsal
assert len(train)==424
checks=[];rubric={}
def add(row,criteria=None,group=None):
 checks.append(row)
 if row['task']=='draft':rubric[row['id']]=dict(criteria=criteria,group=group)
for i,(old,new,color) in enumerate([('Пропуска-07','Допуски-07','сиреневым'),('Счёты-04','Расчёты-04','песочным')]):
 for name,col in [(False,True),(True,False),(False,False),(True,True)]:
  pairs=[('Отказываемся от переименования?',f'Нет, требуется «{new}».' if name else f'Да, оставляем «{old}».'),('Новый цвет сохраняется?',f'Да, значок будет {color}.' if col else 'Нет, сохраняется старый цвет.')]
  if i:pairs.reverse()
  turns=[f'Для раздела «{old}» планировали имя «{new}» и значок {color}. Адрес и содержимое не менять.']
  if not i:turns += ['Содержимое переписать?','Нет, оставить.']
  for q,a in pairs:turns += [q,a]
  turns[-1]+=' Оформи задачу.'
  desc=(f'Переименовать «{old}» в «{new}». ' if name else f'Название «{old}» сохранить. ')+(f'Значок сделать {color}. ' if col else 'Цвет значка не менять. ')+'Адрес и содержимое сохранить.'
  add(draft(f'name-{i}-{int(name)}{int(col)}',turns,desc,f'Раздел «{old}»',literals=[old]+([new] if name else [])),[f'Rename active: {name}',f'Color change active: {col}','Address/content retained'],f'labels-order-{i}')
for allowed,shown in [(False,False),(True,False),(False,True),(True,True)]:
 turns=['Отчёт обслуживания отправлять начальнику участка, владельцу не отправлять. Он содержит код заявки и результат. Телефон техника скрывать.','Код заявки заменить кодом обслуживания?','Да.','Разрешить отчёт владельцу?','Да, прежний запрет снят.' if allowed else 'Нет, запрет остаётся.','Телефон техника показывать?','Да, скрытие снято.' if shown else 'Нет, скрывать.','Результат сохраняем?','Да. Оформи.']
 desc='Отчёт с кодом обслуживания и результатом отправлять начальнику участка'+(' и владельцу. ' if allowed else '. Владельцу не отправлять. ')+('Показывать телефон техника.' if shown else 'Телефон техника скрывать.')
 add(draft(f'report-{int(allowed)}{int(shown)}',turns,desc,'Отчёт обслуживания'),['Section manager, service code replaces request code, result for every recipient',f'Owner receives: {allowed}',f'Technician phone shown: {shown}'],'recipient-field')
add(draft('scope',['В сообщении регистратору показывать номер обращения и дату регистрации. Имя заявителя скрывать.','Добавить приобретение сканера?','Нет, это отдельная задача.','Дата или время?','Дата в формате ГГГГ/ММ/ДД.','Имя показать?','Нет. Оформи только сообщение.'],'Отправлять регистратору номер обращения и дату регистрации в формате ГГГГ/ММ/ДД. Имя заявителя скрывать. Приобретение сканера не включать.','Сообщение о регистрации'),['Registrar, reference number/date with exact format','Hidden applicant','Scanner purchase excluded'])
add(draft('print',['Печатать карточку с кодом партии, датой приёмки и номером склада. Имя приёмщика не печатать.','Поиск партии нужен?','Нет.','Формат даты?','ДД/ММ/ГГ.','Номер склада убрать?','Нет. Оформи.'],'Печатать код партии, дату приёмки в формате ДД/ММ/ГГ и номер склада. Имя приёмщика не печатать. Поиск партии не добавлять.','Печать карточки'),['Three fields and date format','No receiver name','No search'])
add(draft('failure',['Только при сбое синхронизации сообщать администратору номер синхронизации и причину.','Имя оператора показать?','Нет.','Номер заменить кодом ошибки?','Нет.','При успешной синхронизации тоже сообщать?','Нет. Оформи.'],'Только при сбое синхронизации сообщать администратору номер синхронизации и причину. Имя оператора скрывать. При успехе не сообщать.','Сообщение о сбое синхронизации'),['Administrator only on failure','Sync number not error code and cause','Hidden operator'])
add(draft('repeat',['Таблица показывает число готовых заказов, имена клиентов скрыты. Обновление раз в 167 секунд.','167 оставляем?','Нет, 151.','Может всё-таки 167?','Нет, 151 окончательно.','Имена вернуть?','Нет. Оформи итог.'],'Показывать число готовых заказов. Обновлять каждые 151 секунду. Имена клиентов скрывать.','Обновление таблицы'),['Ready-order count','Final 151 not stale 167','Hidden names'])
for i,(note,lo,hi,li,ui) in enumerate([
 ('Больше -52 и не больше -34.',-52,-34,False,True),('Не меньше -52 и меньше -34.',-52,-34,True,False),
 ('Срок больше 81 и не больше 96 секунд.',81,96,False,True),('Срок не меньше 81 и меньше 96 секунд.',81,96,True,False),
 ('Температура строго выше -88 градусов.',-88,None,False,None),('Температура строго ниже -88 градусов.',None,-88,None,False),
 ('Утвердили ровно ноль повторных попыток.',0,0,True,True),('Ноль повторных попыток предложен, решение пока отложено.',None,None,None,None),
]):
 turns=(['Предыдущая норма отменена.','Какую норму считать действующей?'] if i%2 else [])+[note]
 add(ex(f'n{i}','bounds',turns,dict(status='open' if lo is None and hi is None else 'final',lower=lo,upper=hi,lowerInclusive=li,upperInclusive=ui),NUM))
for id,q,a in [
 ('g1','Верни только JSON-массив чисел 39, -24, 11 по возрастанию.',[-24,11,39]),('g2','Верни только JSON-массив чисел 39, -24, 11 по убыванию.',[39,11,-24]),
 ('g3','Расположи 28, -9, 28, 0 от большего к меньшему. Только JSON-массив.',[28,28,0,-9]),('g4','Расположи 28, -9, 28, 0 от меньшего к большему. Только JSON-массив.',[-9,0,28,28]),
 ('g5','Ответь только числом: 22 умножить на 14.',308),('g6','Прочитай items из JSON {"items":92,"ok":true}. Ответь только числом.',92),
 ('g7','Ответь только числом: len([6, 12, 18, 24, 30, 36]) в Python.',6),('g8','Ответь только числом: 437 плюс 263.',700),
]:add(ex(id,'general',[q],a))
assert len(checks)==32 and len(rubric)==16
historical=[]
for p in R.parent.glob('requirements-draft-*/*.jsonl'):
 if p.parent==R:continue
 for row in read(p):
  if 'messages' in row and row['messages'][-1]['role']=='assistant':historical.append(row)
assert set(map(sig,checks)).isdisjoint(map(sig,historical+train))
assert len(set(map(sig,checks)))==32
by_prompt={}
for row in train:
 key=sig(row);answer=row['messages'][-1]['content']
 if key in by_prompt:assert by_prompt[key]==answer
 by_prompt[key]=answer
acq=prior+fixes;assert len(acq)==45 and len({x['id'] for x in acq})==45
hashes={}
for name,rows in [('train.jsonl',train),('corrections.jsonl',fixes),('variants.jsonl',variants),('acquisition.jsonl',acq),('check.jsonl',checks)]:
 p=R/name;p.write_text(''.join(json.dumps(x,ensure_ascii=False)+'\n' for x in rows));hashes[name]=hashlib.sha256(p.read_bytes()).hexdigest()
(R/'rubric.json').write_text(json.dumps(rubric,indent=2)+'\n')
(R/'protocol.json').write_text(json.dumps(dict(hashes=hashes,parent='../requirements-draft-v10/repaired-adapter',layers=13,epochs=1,learning_rate=0.00001,seed=42,steps=len(train),unique_prompts=len(by_prompt),selection='One fixed candidate before fresh-case assessment.',gate='All 45 acquired cases correct after reload. New complete drafts exceed both base and immediate parent; numeric/general do not regress. Report v8 historical comparator. Exact literal UI names in description required where declared; all independent cancellation/prohibition members must pass to claim reliability.',limits='Synthetic related cases, non-blind semantic review, no deployment or automatic release.'),indent=2)+'\n')
print('Prepared 424 training rows, 45 acquisition targets and 32 reserved cases.')
