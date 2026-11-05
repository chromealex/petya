"""Freeze diverse requirement corrections with complete familiar retention."""
import hashlib,json
from pathlib import Path
R=Path(__file__).parent
OLD=R.parent/'requirements-draft-v17'
def read(p):return list(map(json.loads,p.read_text().splitlines()))

def sig(r):return json.dumps(r['messages'][:-1],ensure_ascii=False,sort_keys=True)

def ex(id,task,turns,answer,literals=None):
 assert len(turns)%2==1
 m=([dict(role='system',content=systems[task])] if task in systems else [])+[dict(role='user' if i%2==0 else 'assistant',content=s) for i,s in enumerate(turns)]
 m.append(dict(role='assistant',content=json.dumps(answer,ensure_ascii=False,separators=(',',':'))))
 r=dict(id=id,task=task,messages=m)
 if literals:r['required_literals']=literals
 return r

def draft(id,turns,desc,title,literals=None):return ex(id,'draft',turns,dict(description=desc,questions=[],summary=title),literals)

def bound(id,turns,lo,hi,li,ui,status='final'):return ex(id,'bounds',turns,dict(status=status,lower=lo,upper=hi,lowerInclusive=li,upperInclusive=ui))

def reports(prefix,vocab,question_style=0):
 result=[]
 for i,(main,other,field,oldcode,newcode) in enumerate(vocab):
  for allow,show in [(False,False),(True,False),(False,True),(True,True)]:
   pairs=[(f'Разрешить отправку {other}?','Да, запрет снят.' if allow else 'Нет, запрет остаётся.'),(f'Показывать {field}?','Да, скрытие отменено.' if show else 'Нет, скрывать.')]
   if i%2:pairs.reverse()
   turns=[f'Отчёт отправлять {main}, {other} не отправлять. В нём {oldcode} и результат. Скрывать {field}.',f'Заменить {oldcode} на {newcode}?','Да.']
   for q,a in pairs:turns += [q,a]
   # Identical final question across all four permission states.
   turns+=['Результат сохраняем?' if not question_style else 'Результат убрать?','Да. Оформи итог.' if not question_style else 'Нет, оставить. Оформи итог.']
   desc=f'Отчёт с полями «{newcode}» и «результат» отправлять {main}'+(f' и {other}. ' if allow else f'. {other.capitalize()} не отправлять. ')+(f'Показывать {field}.' if show else f'Скрывать {field}.')
   result.append(draft(f'{prefix}-{i}-{int(allow)}{int(show)}',turns,desc,'Отправка отчёта'))
 return result

def names(prefix,labels):
 result=[]
 for i,(old,new,col) in enumerate(labels):
  for rename,color in [(False,True),(True,False),(False,False),(True,True)]:
   pairs=[('Отменить переименование?',f'Нет, нужно «{new}».' if rename else f'Да, оставляем «{old}».'),('Цвет меняем?',f'Да, значок будет {col}.' if color else 'Нет, старый цвет.')]
   if i%2:pairs.reverse()
   turns=[f'Планировали переименовать «{old}» в «{new}» и сделать значок {col}. Адрес и содержимое сохранить.']
   for q,a in pairs:turns +=[q,a]
   turns+=['Содержимое переписать?','Нет. Оформи итог.']
   desc=(f'Переименовать «{old}» в «{new}». ' if rename else f'Название «{old}» сохранить. ')+(f'Значок сделать {col}. ' if color else 'Цвет значка не менять. ')+'Адрес и содержимое сохранить.'
   result.append(draft(f'{prefix}-{i}-{int(rename)}{int(color)}',turns,desc,f'Раздел «{old}»',[old]+([new] if rename else [])))
 return result

def failures(prefix,contexts):
 result=[]
 for i,(event,who,code,person) in enumerate(contexts):
  for hidden in [False,True]:
   turns=[f'Только при сбое {event} сообщать {who} {code} и причину.',f'Показывать {person}?','Нет.' if hidden else 'Да.',f'Заменить {code} кодом ошибки?','Нет.','При успехе тоже сообщать?','Нет. Оформи.']
   desc=f'Только при сбое {event} сообщать {who} {code} и причину. '+(f'Скрывать {person}. ' if hidden else f'Показывать {person}. ')+'При успехе не сообщать.'
   result.append(draft(f'{prefix}-{i}-{int(hidden)}',turns,desc,'Уведомление о сбое'))
 return result

def value_pairs(prefix,values):
 rows=[]
 for i,n in enumerate(values):
  rows += [bound(f'{prefix}-{i}-exact',[f'Утверждено ровно {n}.'],n,n,True,True),bound(f'{prefix}-{i}-upper',[f'Утверждено не больше {n}.'],None,n,None,True),bound(f'{prefix}-{i}-lower',[f'Утверждено строго больше {n}.'],n,None,False,None),bound(f'{prefix}-{i}-open',[f'Значение {n} предложено, но пока не утверждено.'],None,None,None,None,'open')]
 return rows

def sorts(prefix,arrays):
 rows=[]
 for i,values in enumerate(arrays):
  text=', '.join(map(str,values))
  for reverse in [False,True]:
   for style in [0,1]:
    prompt=(f'Верни JSON-массив {text} по {"убыванию" if reverse else "возрастанию"}.' if not style else f'Расположи {text} от {"большего к меньшему" if reverse else "меньшего к большему"}. Только JSON-массив.')
    rows.append(ex(f'{prefix}-{i}-{int(reverse)}-{style}','general',[prompt],sorted(values,reverse=reverse)))
 return rows

def replacement(prefix,vocab,fresh=False):
 rows=[]
 for i,(main,other,field,old,new) in enumerate(vocab):
  for replace in [False,True]:
   for allow in [False,True]:
    for show in [False,True]:
     turns=[f'Сводку отправлять {main}, {other} не отправлять. Поля: {old} и результат. Скрывать {field}.']
     changes=[('Старый идентификатор оставить?',f'Нет, использовать {new}.' if replace else f'Да, сохранить {old}; {new} не добавлять.'),(f'Запрет на отправку {other} остаётся?',f'Нет, {other} тоже отправлять.' if allow else 'Да, запрет остаётся.'),(f'Продолжаем скрывать {field}?','Нет, теперь показывать.' if show else 'Да, скрывать.')]
     if fresh:
      changes[0]=('Как поступить с полем идентификатора?',f'Убрать {old}. Вместо него нужен {new}.' if replace else f'Предложение заменить на {new} отменяю. Оставь {old}.')
      changes[1]=(f'Получателей меняем?',f'Да, добавь отправку {other}.' if allow else f'Нет. Запрет для {other} сохраняется.')
     if i%2:changes=changes[1:]+changes[:1]
     for q,a in changes:turns += [q,a]
     turns+=['Убрать результат из сводки?','Нет, результат нужен. Подведи итог.']
     desc=f'Сводку с полями «{new if replace else old}» и «результат» отправлять {main}'+(f' и {other}. ' if allow else f'. {other.capitalize()} не отправлять. ')+(f'Показывать {field}.' if show else f'Скрывать {field}.')
     rows.append(draft(f'{prefix}-{i}-{int(replace)}{int(allow)}{int(show)}',turns,desc,'Отправка сводки'))
 return rows
acq=read(OLD/'acquisition.jsonl')
for filename in ['check.jsonl','release-dialogues.jsonl']:
 for row in read(OLD/filename):
  row['id']='v18-'+row['id'];acq.append(row)
assert len(acq)==469 and len(set(map(sig,acq)))==469
systems={t:next(x['messages'][0]['content'] for x in acq if x['task']==t) for t in ['draft','bounds']}
variants=[]
for i,(who,doc,old,new,private) in enumerate([('аудитору','заключение','номер обращения','номер ревизии','телефон автора'),('партнёру','протокол','код заявки','код осмотра','почту исполнителя')]):
 for allow in [False,True]:
  for visible in [False,True]:
   turns=[f'Подготовить {doc}: {old} и результат. Отправку {who} разрешаю. Скрывать {private}.','Поле заменить?',f'Да, {new} вместо {old}.','Разрешение на отправку остаётся?',f'Да, отправлять {who}.' if allow else 'Нет, разрешение отзываю. Только черновик.','Что с личными данными?',f'Показывать {private}. Оформи.' if visible else f'Скрывать {private}. Оформи.']
   desc=f'Подготовить {doc} с полями «{new}» и «результат» вместо «{old}» и «результат». '+(f'Отправка {who} разрешена. ' if allow else f'Сохранить черновиком, {who} не отправлять. ')+(f'Показывать {private}.' if visible else f'Скрывать {private}.')
   variants.append(draft(f'revoke-{i}-{int(allow)}{int(visible)}',turns,desc,'Подготовка документа'))
for restore_code in [False,True]:
 for restore_number in [False,True]:
  turns=['В карточке код обращения, номер договора и статус.','Меняем оба идентификатора?','Да: код обращения на код проверки, номер договора на номер акта.','Отменить первую замену?','Да, вернуть код обращения.' if restore_code else 'Нет, код проверки остаётся.','А вторую?',('Её тоже отменить, вернуть номер договора.' if restore_number else 'Номер акта остаётся.')+' Статус не трогать. Составь задачу.']
  variants.append(draft(f'selective-{int(restore_code)}{int(restore_number)}',turns,f'В карточке использовать «{"код обращения" if restore_code else "код проверки"}» и «{"номер договора" if restore_number else "номер акта"}». Статус сохранить.','Поля карточки'))
for allow_full in [False,True]:
 for allow_short in [False,True]:
  turns=['Полная справка содержит код проверки и результат. Краткая — только код проверки. Получатель — клиент. Пока ничего не отправлять.','Полную отправлять?', 'Да, разрешаю.' if allow_full else 'Нет, оставить черновиком.','Краткую отправлять?', 'Да, разрешаю.' if allow_short else 'Нет, только подготовить.','Добавить результат в краткую?','Нет. Опиши обе версии и отдельные разрешения.']
  variants.append(draft(f'versions-{int(allow_full)}{int(allow_short)}',turns,'Полная справка содержит код проверки и результат; '+('клиенту отправлять. ' if allow_full else 'сохранить черновиком, клиенту не отправлять. ')+'Краткая справка содержит только код проверки без результата; '+('клиенту отправлять.' if allow_short else 'только подготовить, клиенту не отправлять.'),'Две версии справки'))
for i,(field,other) in enumerate([('email','телефон'),('адрес','имя')]):
 for remove in [False,True]:
  turns=[f'Убрать {field} из профиля. {other.capitalize()} оставить.','Удаляем?',f'Нет, отменяю удаление {field}.','Что делать с отменой?',f'Отмену отменить. {field.capitalize()} всё-таки удалить.' if remove else f'Отмена остаётся: {field} сохранить.','Второе поле тоже менять?','Нет. Зафиксируй окончательный вариант.']
  variants.append(draft(f'double-cancel-{i}-{int(remove)}',turns,(f'Удалить {field} из профиля. ' if remove else f'Сохранить {field} в профиле. ')+f'{other.capitalize()} сохранить.','Поля профиля'))
for approved in [False,True]:
 for channel_known in [False,True]:
  turns=['При сбое экспорта уведомлять инженера. Только имя файла и причина, без вложений.','Канал — Telegram?', 'Да, Telegram.' if channel_known else 'Нет, канал пока не выбрал.','Добавить автоматический повтор экспорта?', 'Да, один повтор.' if approved else 'Нет, повтор не утверждён.','При успехе уведомлять?','Нет. Оформи согласованное; открытые вопросы сохрани.']
  answer={'description':'Только при сбое экспорта уведомлять инженера, передавать имя файла и причину без вложения. При успехе не уведомлять. '+('Канал: Telegram. ' if channel_known else 'Канал не выбран. ')+('Добавить один автоматический повтор экспорта.' if approved else 'Автоматический повтор экспорта не добавлять.'),'summary':'Ошибка экспорта','questions':[] if channel_known else ['Через какой канал уведомлять инженера?']}
  variants.append(ex(f'open-{int(approved)}{int(channel_known)}','draft',turns,answer))
for li in [False,True]:
 for ui in [False,True]:
  turns=['Раньше диапазон был от -30 до -6 включительно.','Что изменить?',f'Нижняя граница -23, {"включительно" if li else "не включительно"}. Верхняя -7, {"включительно" if ui else "не включительно"}.','Старые границы оставить?','Нет.','Округлять дробные значения?','Нет, дроби сохранить. Составь задачу.']
  variants.append(draft(f'prose-bounds-{int(li)}{int(ui)}',turns,f'Принимать значения {"не меньше" if li else "строго больше"} -23 и {"не больше" if ui else "строго меньше"} -7. Прежние границы отменены. Дробные значения сохранять без округления.','Диапазон значений'))
for i,(old,new,file) in enumerate([('Ёлка-009','ёлка-0009','tree_009.csv'),('Счёт-016','счёт-0016','bill_016.csv')]):
 for rename in [False,True]:
  variants.append(draft(f'exact-{i}-{int(rename)}',[f'Раздел «{old}» переименовать в «{new}». Файл {file} не менять.','Переименование точно нужно?', 'Да, строго с этими буквами и нулями.' if rename else f'Нет, отменяю, оставить «{old}».','Файл переименовать?','Нет. Оформи.'],(f'Переименовать раздел «{old}» в «{new}». ' if rename else f'Название раздела «{old}» сохранить. ')+f'Файл {file} не переименовывать.','Название раздела',[old]+([new] if rename else [])+[file]))
for quote in [False,True]:
 for allow in [False,True]:
  turns=['Подготовить инструкцию для секретаря.','Добавить фразу «отменить отправку»?', 'Да, как цитату-пример.' if quote else 'Нет, такой пример не нужен.','Саму инструкцию секретарю отправлять?', 'Да, я разрешаю отправку секретарю.' if allow else 'Нет, отправку запрещаю.','Цитата меняет разрешение?','Нет, решение об отправке отдельное. Составь задачу.']
  variants.append(draft(f'quote-{int(quote)}{int(allow)}',turns,'Подготовить инструкцию. '+('Сохранить цитату-пример «отменить отправку». ' if quote else 'Пример «отменить отправку» не добавлять. ')+('Отправка секретарю разрешена.' if allow else 'Секретарю не отправлять.'),'Инструкция для секретаря'))
assert len(variants)==36
release_rehearsal=[x for x in acq if x['id'] in {'v18-'+y['id'] for y in read(OLD/'release-dialogues.jsonl')}]
permission=[x for x in acq if x['id'].startswith('v18-polarity-0-1')]
assert len(release_rehearsal)==16 and len(permission)==4
train=acq+release_rehearsal*6+permission*4+variants*3+read(R.parent/'requirements-draft-v12/numeric-rehearsal.jsonl')+read(R.parent/'requirements-draft-v15/negative-variants.jsonl')
checks=names('name',[('Счёт-053','Расчёт-053','бирюзовым'),('Заявки-061','Обращения-061','сиреневым')])
checks+=reports('report',[('оператору','арендатору','адрес ревизора','код перевозки','код регистрации'),('инспектору','партнёру','почту аналитика','номер обращения','номер исследования')],1)
checks+=replacement('polarity',[('ревизору','поставщику','телефон консультанта','код описи','код сверки'),('руководителю','клиенту','адрес эксперта','номер накладной','номер приёмки')],True)
checks+=failures('failure',[('индексации архива','оператору','код архива','почту составителя')])
checks+=[draft('scope',['Сообщение администратору: номер протокола и дата. Имя автора скрывать.','Добавить закупку монитора?','Нет, это другая задача.','Формат даты?','ДД-ММ-ГГГГ.','Имя автора вернуть?','Нет. Составь задачу.'],'Отправлять администратору номер протокола и дату в формате ДД-ММ-ГГГГ. Имя автора скрывать. Закупку монитора не включать.','Сообщение об акте'),draft('repeat',['Показывать число обработанных заявок. Имена исполнителей скрывать. Интервал 281 секунды.','281 остаётся?','Нет, 257.','Вернуть прежний интервал?','Нет, окончательно 257.','Раскрыть имена?','Нет. Оформи.'],'Показывать число обработанных заявок каждые 257 секунду. Имена исполнителей скрывать.','Счётчик записей')]
checks+=value_pairs('value',[-163,-173,-0.8125,-25.875])
for i,(li,ui) in enumerate([(False,False),(False,True),(True,False),(True,True)]):
 checks.append(bound(f'interval-{i}',['Раньше согласовали от 12 до 18.','Сохраняем?','Нет, это отменено.','Что утверждено теперь?',f'Значение {"не меньше" if li else "больше"} -113 и {"не больше" if ui else "меньше"} -71.'],-113,-71,li,ui))
checks+=sorts('sort',[[-69,-19,-38],[-94,-33,-62],[-46,-9,-46,-25],[-0.8125,-8.8125,-4.8125],[-146,-37,-85],[11.25,-7.25,3.25]])
for i,(q,a) in enumerate([('Ответь только числом: 31 умножить на 18.',558),('Прочитай items из JSON {"items":179,"ok":true}. Ответь только числом.',179),('Ответь только числом: len([13, 26, 39, 52, 65, 78, 91]) в Python.',7),('Ответь только числом: 419 плюс 581.',1000)]):checks.append(ex(f'g{i}','general',[q],a))

assert len(checks)==84 and len(train)==801
historical=[]
for p in R.parent.glob('requirements-draft-*/*.jsonl'):
 if p.parent!=R:historical += [x for x in read(p) if 'messages' in x]
assert set(map(sig,checks)).isdisjoint(map(sig,historical+train))
assert len(set(map(sig,checks)))==84
by={}
for row in train:
 k=sig(row);v=json.loads(row['messages'][-1]['content'])
 if k in by:assert by[k]==v
 by[k]=v
hashes={}
for name,rows in [('train',train),('acquisition',acq),('diverse-variants',variants),('check',checks)]:
 p=R/(name+'.jsonl');p.write_text(''.join(json.dumps(x,ensure_ascii=False)+'\n' for x in rows));hashes[p.name]=hashlib.sha256(p.read_bytes()).hexdigest()
(R/'rubric.json').write_text(json.dumps({x['id']:json.loads(x['messages'][-1]['content']) for x in checks if x['task']=='draft'},ensure_ascii=False,indent=2)+'\n')
(R/'protocol.json').write_text(json.dumps(dict(hashes=hashes,parent='../requirements-draft-v17/adapter',steps=len(train),layers=13,epochs=1,seed=42,learning_rate=0.000005,gate='All 469 familiar targets correct; no lost parent successes on fresh cases; bounds, sorts and exact labels preserved. Supplementary independent varied dialogues and real runtime checks required before release.',selection='Fixed run. No candidate fresh inference before recorded acquisition decision. Freeze any acquisition-only repair before execution.',limits='Synthetic cases and non-blind review. Prior release dialogues are now training/retention data, never fresh evidence.'),indent=2)+'\n')
print(len(train),len(acq),len(checks))
