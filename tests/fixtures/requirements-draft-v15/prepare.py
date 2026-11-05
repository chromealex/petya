"""Freeze balanced all-negative sorting repair and independent retention checks."""
import hashlib,json
from pathlib import Path
R=Path(__file__).parent;OLD=R.parent/'requirements-draft-v14'
def read(p):return list(map(json.loads,p.read_text().splitlines()))
def sig(r):return json.dumps(r['messages'][:-1],ensure_ascii=False,sort_keys=True)
prior=read(OLD/'acquisition.jsonl');last=read(OLD/'check.jsonl')
for row in last:row['id']='v15-'+row['id']
acq=prior+last
assert len(acq)==225 and len(set(map(sig,acq)))==225
systems={t:next(x['messages'][0]['content'] for x in acq if x['task']==t) for t in ['draft','bounds']}
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
negative=sorts('negative',[[-53,-7,-26],[-68,-14,-39],[-5,-91,-42],[-72,-18,-54],[-31,-4,-31,-16],[-83,-25,-11],[-0.5,-3.5,-1.5],[-2.25,-0.25,-7.25],[-104,-19,-67],[-8,-3,-8,-1],[-46,-92,-15],[-0.75,-5.75,-2.75]])
pairs=[x for x in last if x['id'].startswith('v15-sort-2-')];assert len(pairs)==4
train=acq+pairs*8+negative*2+read(OLD/'sort-variants.jsonl')+read(R.parent/'requirements-draft-v12/numeric-rehearsal.jsonl')
assert len(train)==449
checks=names('name',[('Пропуска-19','Допуски-19','персиковым'),('Счёты-20','Расчёты-20','кобальтовым')])
checks+=reports('report',[('председателю','партнёру','телефон секретаря','код заявки','код решения'),('директору','покупателю','почту ревизора','номер обращения','номер ревизии')],1)
checks+=failures('failure',[('индексации','аналитику','номер индексации','имя оператора')])
checks += [draft('scope',['Сообщение диспетчеру: номер приёма и дата. Имя посетителя скрывать.','Добавить покупку монитора?','Нет, это отдельная задача.','Формат даты?','ДД/ГГГГ/ММ.','Имя вернуть?','Нет. Оформи сообщение.'],'Отправлять диспетчеру номер приёма и дату в формате ДД/ГГГГ/ММ. Имя посетителя скрывать. Покупку монитора не включать.','Сообщение о приёме'),draft('repeat',['Показывать число проверенных записей. Имена редакторов скрыты. Обновлять раз в 223 секунды.','223 оставляем?','Нет, 207.','Вернуть 223?','Нет, окончательно 207.','Имена показать?','Нет. Оформи.'],'Показывать число проверенных записей. Имена редакторов скрывать. Обновлять каждые 207 секунд.','Счётчик записей')]
checks+=value_pairs('value',[-127,-87,-0.875,-18.25])
for i,(li,ui) in enumerate([(False,False),(False,True),(True,False),(True,True)]):
 note=f'Значение {"не меньше" if li else "больше"} -96 и {"не больше" if ui else "меньше"} -73.'
 checks.append(bound(f'interval-{i}',['Раньше было от 9 до 14.','Оставить?','Нет, отменено.','Какие границы утверждены?',note],-96,-73,li,ui))
checks+=sorts('sort',[[-59,-13,-28],[-76,-21,-48],[-34,-6,-34,-17],[-0.125,-4.125,-1.125],[-118,-24,-69],[6.25,-3.25,0.25]])
for i,(q,a) in enumerate([('Ответь только числом: 27 умножить на 19.',513),('Прочитай items из JSON {"items":73,"ok":true}. Ответь только числом.',73),('Ответь только числом: len([7, 14, 21, 28, 35]) в Python.',5),('Ответь только числом: 426 плюс 574.',1000)]):checks.append(ex(f'g{i}','general',[q],a))
assert len(checks)==68
historical=[]
for p in R.parent.glob('requirements-draft-*/*.jsonl'):
 if p.parent==R:continue
 historical += [x for x in read(p) if 'messages' in x and x['messages'][-1]['role']=='assistant']
assert set(map(sig,checks)).isdisjoint(map(sig,historical+train))
assert len(set(map(sig,checks)))==68
by={}
for row in train:
 k=sig(row);v=json.loads(row['messages'][-1]['content'])
 if k in by:assert by[k]==v
 by[k]=v
hashes={}
for name,rows in [('train',train),('acquisition',acq),('balanced-corrections',pairs),('negative-variants',negative),('check',checks)]:
 p=R/(name+'.jsonl');p.write_text(''.join(json.dumps(x,ensure_ascii=False)+'\n' for x in rows));hashes[p.name]=hashlib.sha256(p.read_bytes()).hexdigest()
(R/'rubric.json').write_text(json.dumps({x['id']:json.loads(x['messages'][-1]['content']) for x in checks if x['task']=='draft'},ensure_ascii=False,indent=2)+'\n')
(R/'protocol.json').write_text(json.dumps(dict(hashes=hashes,parent='../requirements-draft-v14/adapter',steps=len(train),layers=13,epochs=1,seed=42,learning_rate=0.000005,gate='All 225 familiar cases correct. Fresh sorting improves versus parent; drafts do not regress (allow parent ceiling); numeric 20/20, labels 8/8, no individual parent success lost. Every targeted state must pass before claiming full coverage; no automatic release.',selection='Fixed run; only acquisition-based repair before fresh candidate inference.',limits='Small related synthetic sample; non-blind manual draft review.'),indent=2)+'\n')
print('Frozen:',len(train),'training rows;',len(acq),'retention targets;',len(checks),'fresh checks.')
