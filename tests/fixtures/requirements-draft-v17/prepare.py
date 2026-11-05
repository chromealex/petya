"""Freeze balanced field replacement and retention before inference."""
import hashlib,json
from pathlib import Path
R=Path(__file__).parent
OLD=R.parent/'requirements-draft-v16'
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

acq=read(OLD/'acquisition.jsonl')
last=read(OLD/'check.jsonl')
for x in last:x['id']='v17-'+x['id']
acq+=last
assert len(acq)==369 and len(set(map(sig,acq)))==369
systems={t:next(x['messages'][0]['content'] for x in acq if x['task']==t) for t in ['draft','bounds']}
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
variants=replacement('replacement',[('инспектору','арендатору','телефон эксперта','код обращения','код осмотра'),('куратору','поставщику','почту аудитора','номер заказа','номер экспертизы'),('администратору','партнёру','адрес техника','код заявки','код проверки'),('руководителю','клиенту','имя ревизора','номер запроса','номер заключения')])
fixes=[x for x in last if x['id'].startswith('v17-polarity-0-')]
assert len(fixes)==4
train=acq+fixes*8+variants*3+read(R.parent/'requirements-draft-v12/numeric-rehearsal.jsonl')+read(R.parent/'requirements-draft-v15/negative-variants.jsonl')
checks=names('name',[('Счёт-031','Расчёт-031','лиловым'),('Заявки-047','Обращения-047','янтарным')])
checks+=reports('report',[('диспетчеру','покупателю','почту оценщика','код доставки','код приёмки'),('секретарю','заказчику','телефон аналитика','номер регистрации','номер решения')],1)
checks+=replacement('polarity',[('контролёру','подрядчику','адрес консультанта','код декларации','код обследования'),('заведующему','заявителю','имя эксперта','номер поставки','номер согласования')],True)
checks+=failures('failure',[('архивирования','оператору','номер архива','имя составителя')])
checks+=[draft('scope',['Сообщение куратору: номер акта и дата. Имя автора скрывать.','Добавить закупку сканера?','Нет, это другая задача.','Формат даты?','ГГГГ/ДД/ММ.','Имя автора вернуть?','Нет. Составь задачу.'],'Отправлять куратору номер акта и дату в формате ГГГГ/ДД/ММ. Имя автора скрывать. Закупку сканера не включать.','Сообщение об акте'),draft('repeat',['Показывать число проверенных записей. Имена редакторов скрывать. Интервал 263 секунды.','263 остаётся?','Нет, 241.','Вернуть прежний интервал?','Нет, окончательно 241.','Раскрыть имена?','Нет. Оформи.'],'Показывать число проверенных записей каждые 241 секунду. Имена редакторов скрывать.','Счётчик записей')]
checks+=value_pairs('value',[-149,-83,-0.6875,-21.875])
for i,(li,ui) in enumerate([(False,False),(False,True),(True,False),(True,True)]):
 checks.append(bound(f'interval-{i}',['Раньше согласовали от 12 до 18.','Сохраняем?','Нет, это отменено.','Что утверждено теперь?',f'Значение {"не меньше" if li else "больше"} -107 и {"не больше" if ui else "меньше"} -69.'],-107,-69,li,ui))
checks+=sorts('sort',[[-67,-17,-34],[-86,-29,-58],[-42,-6,-42,-21],[-0.625,-7.625,-3.625],[-138,-31,-79],[9.25,-5.25,1.25]])
for i,(q,a) in enumerate([('Ответь только числом: 29 умножить на 16.',464),('Прочитай items из JSON {"items":167,"ok":true}. Ответь только числом.',167),('Ответь только числом: len([11, 22, 33, 44, 55]) в Python.',5),('Ответь только числом: 427 плюс 573.',1000)]):checks.append(ex(f'g{i}','general',[q],a))
assert len(checks)==84 and len(train)==609
historical=[]
for p in R.parent.glob('requirements-draft-*/*.jsonl'):
 if p.parent!=R:historical += [x for x in read(p) if 'messages' in x]
assert set(map(sig,checks)).isdisjoint(map(sig,historical+train))
assert len(set(map(sig,checks)))==len(checks)
by={}
for row in train:
 k=sig(row);v=json.loads(row['messages'][-1]['content'])
 if k in by:assert by[k]==v
 by[k]=v
hashes={}
for name,rows in [('train',train),('acquisition',acq),('balanced-corrections',fixes),('replacement-variants',variants),('check',checks)]:
 p=R/(name+'.jsonl');p.write_text(''.join(json.dumps(x,ensure_ascii=False)+'\n' for x in rows));hashes[p.name]=hashlib.sha256(p.read_bytes()).hexdigest()
(R/'rubric.json').write_text(json.dumps({x['id']:json.loads(x['messages'][-1]['content']) for x in checks if x['task']=='draft'},ensure_ascii=False,indent=2)+'\n')
(R/'protocol.json').write_text(json.dumps(dict(hashes=hashes,parent='../requirements-draft-v16/adapter',steps=len(train),layers=13,epochs=1,seed=42,learning_rate=0.000005,gate='All 369 familiar targets correct, all fresh field decisions correct, no lost parent successes, bounds 20/20, sorting 24/24, literal labels 8/8. Research gate only; release additionally requires independent diverse dialogue and runtime integration verification.',selection='Fixed run. Acquisition-only repair permitted before candidate fresh inference; freeze any repair first.',limits='Synthetic related cases; non-blind manual semantic review; offline greedy diagnostics do not establish live reliability.'),indent=2)+'\n')
print(len(train),len(acq),len(checks))
