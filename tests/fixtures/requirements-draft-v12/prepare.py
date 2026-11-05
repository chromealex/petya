"""Freeze balanced bounds rehearsal and independent permission decisions."""
import copy,hashlib,json,random
from pathlib import Path
R=Path(__file__).parent;OLD=R.parent/'requirements-draft-v11'
def read(p):return list(map(json.loads,p.read_text().splitlines()))
def sig(r):return json.dumps(r['messages'][:-1],ensure_ascii=False,sort_keys=True)
def clean(r):return {k:copy.deepcopy(v) for k,v in r.items() if k in ['id','task','messages','required_literals']}
prior=read(OLD/'acquisition.jsonl');fixes=[clean(x) for x in read(OLD/'remaining-corrections.jsonl')]
for r in fixes:r['id']='v12-'+r['id']
oldtrain=read(OLD/'train.jsonl');systems={t:next(x['messages'][0]['content'] for x in oldtrain if x['task']==t) for t in ['bounds','draft']}
def ex(id,task,turns,answer,literals=None):
 assert len(turns)%2==1
 m=([dict(role='system',content=systems[task])] if task in systems else [])+[dict(role='user' if i%2==0 else 'assistant',content=s) for i,s in enumerate(turns)]
 m.append(dict(role='assistant',content=json.dumps(answer,ensure_ascii=False,separators=(',',':'))))
 r=dict(id=id,task=task,messages=m)
 if literals:r['required_literals']=literals
 return r
def draft(id,turns,desc,title,literals=None):return ex(id,'draft',turns,dict(description=desc,questions=[],summary=title),literals)
def bound(id,turns,lo,hi,li,ui,status='final'):return ex(id,'bounds',turns,dict(status=status,lower=lo,upper=hi,lowerInclusive=li,upperInclusive=ui))
def numeric(prefix,pairs):
 rows=[]
 for i,(lo,hi) in enumerate(pairs):
  for li,ui in [(False,False),(False,True),(True,False),(True,True)]:
   note=f'Значение {"не меньше" if li else "больше"} {lo} и {"не больше" if ui else "меньше"} {hi}.'
   for history in [False,True]:
    turns=[note]
    if history:turns=['Ранее было от 1 до 2 включительно.','Оставить эту норму?','Нет, полностью отменить.','Какие границы утверждены?',note]
    rows.append(bound(f'{prefix}-{i}-{int(li)}{int(ui)}-{int(history)}',turns,lo,hi,li,ui))
 return rows
nums=numeric('bounds',[(-63,-41),(72,89),(-8,6),(0.5,3.5),(-5.5,-1.5),(104,127)])
for i,n in enumerate([-97,0,37,2.5]):
 nums += [bound(f'one-{i}-lower',[f'Утверждено строго больше {n}.'],n,None,False,None),bound(f'one-{i}-upper',[f'Утверждено не больше {n}.'],None,n,None,True),bound(f'exact-{i}',[f'Утверждено ровно {n}.'],n,n,True,True),bound(f'open-{i}',[f'Значение {n} предложено, но не согласовано.'],None,None,None,None,'open')]
assert len(nums)==64
variants=[]
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
vocab=[('бухгалтеру','покупателю','телефон кассира','код чека','код возврата'),('инспектору','подрядчику','почту мастера','номер заявки','номер акта'),('диспетчеру','водителю','адрес клиента','код заказа','код рейса'),('редактору','автору','имя корректора','номер текста','номер версии')]
variants+=reports('report-a',vocab)+reports('report-b',vocab,1)
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
variants+=names('label',[('Пропуска-02','Допуски-02','бежевым'),('Счёты-06','Расчёты-06','бирюзовым'),('Листы_03','Страницы_03','розовым'),('Реестр №08','Список №08','серым')])
def failures(prefix,contexts):
 result=[]
 for i,(event,who,code,person) in enumerate(contexts):
  for hidden in [False,True]:
   turns=[f'Только при сбое {event} сообщать {who} {code} и причину.',f'Показывать {person}?','Нет.' if hidden else 'Да.',f'Заменить {code} кодом ошибки?','Нет.','При успехе тоже сообщать?','Нет. Оформи.']
   desc=f'Только при сбое {event} сообщать {who} {code} и причину. '+(f'Скрывать {person}. ' if hidden else f'Показывать {person}. ')+'При успехе не сообщать.'
   result.append(draft(f'{prefix}-{i}-{int(hidden)}',turns,desc,'Уведомление о сбое'))
 return result
variants+=failures('failure',[('выгрузки','аналитику','номер выгрузки','имя оператора'),('копирования','администратору','номер копирования','адрес сотрудника'),('передачи','диспетчеру','код передачи','телефон оператора'),('импорта','модератору','номер импорта','имя автора')])
assert len(variants)==56
unique={sig(x):x for x in oldtrain if x['task']=='general'};general=random.Random(42).sample(list(unique.values()),16)
labels=[r for r in read(OLD/'variants.jsonl') if r['id'].startswith('label-')]
acq=prior+fixes
train=acq*4+fixes*12+variants*2+nums*2+general*2+labels
assert len(train)==596
checks=names('name',[('Пропуска-09','Допуски-09','лиловым'),('Счёты-08','Расчёты-08','лазурным')])
checks+=reports('report',[('начальнику смены','заказчику','почту контролёра','номер обращения','номер проверки')],1)
checks+=failures('failure',[('архивации','администратору','номер архивации','имя архивариуса')])
checks += [draft('scope',['Сообщение координатору: номер встречи и дата. Имя участника скрывать.','Добавить покупку проектора?','Нет, это отдельная задача.','Формат даты?','ДД-ГГГГ-ММ.','Имя вернуть?','Нет. Оформи сообщение.'],'Отправлять координатору номер встречи и дату в формате ДД-ГГГГ-ММ. Имя участника скрывать. Покупку проектора не включать.','Сообщение о встрече'),draft('repeat',['Показывать число принятых посылок. Имена отправителей скрыты. Обновлять раз в 183 секунды.','183 оставляем?','Нет, 169.','Вернуть 183?','Нет, окончательно 169.','Имена показать?','Нет. Оформи.'],'Показывать число принятых посылок. Имена отправителей скрывать. Обновлять каждые 169 секунд.','Счётчик посылок')]
# Eight combinations, using alternating direct and five-turn histories.
for i,(lo,hi) in enumerate([(-74,-56),(83,98)]):
 for j,(li,ui) in enumerate([(False,False),(False,True),(True,False),(True,True)]):
  note=f'Значение {"не меньше" if li else "больше"} {lo} и {"не больше" if ui else "меньше"} {hi}.'
  turns=['Старая норма от 4 до 9 включительно.','Её сохранить?','Нет, отменена.','Какая норма теперь?',note] if (i+j)%2 else [note]
  checks.append(bound(f'n-{i}-{j}',turns,lo,hi,li,ui))
for i,n in enumerate([-93,4.5]):
 checks +=[bound(f'lower-{i}',[f'Утверждено строго больше {n}.'],n,None,False,None),bound(f'upper-{i}',[f'Утверждено не больше {n}.'],None,n,None,True),bound(f'exact-{i}',[f'Утверждено ровно {n}.'],n,n,True,True),bound(f'open-{i}',[f'Значение {n} предложено, решение отложено.'],None,None,None,None,'open')]
for i,(q,a) in enumerate([('Верни JSON-массив 42, -31, 13 по возрастанию.',[-31,13,42]),('Верни JSON-массив 42, -31, 13 по убыванию.',[42,13,-31]),('Отсортируй 19, -6, 19, 0 от большего к меньшему. Только JSON-массив.',[19,19,0,-6]),('Отсортируй 19, -6, 19, 0 от меньшего к большему. Только JSON-массив.',[-6,0,19,19]),('Ответь только числом: 23 умножить на 16.',368),('Прочитай items из JSON {"items":87,"ok":true}. Ответь только числом.',87),('Ответь только числом: len([3, 6, 9, 12, 15, 18, 21]) в Python.',7),('Ответь только числом: 458 плюс 242.',700)]):checks.append(ex(f'g{i}','general',[q],a))
assert len(checks)==40 and len(acq)==52
historical=[]
for p in R.parent.glob('requirements-draft-*/*.jsonl'):
 if p.parent==R:continue
 historical += [x for x in read(p) if 'messages' in x and x['messages'][-1]['role']=='assistant']
assert set(map(sig,checks)).isdisjoint(map(sig,historical+train))
assert len(set(map(sig,checks)))==40
by_prompt={}
for row in train:
 key=sig(row);answer=row['messages'][-1]['content']
 if key in by_prompt:assert by_prompt[key]==answer
 by_prompt[key]=answer
hashes={}
for name,rows in [('train',train),('acquisition',acq),('corrections',fixes),('numeric-rehearsal',nums),('variants',variants),('check',checks)]:
 p=R/(name+'.jsonl');p.write_text(''.join(json.dumps(x,ensure_ascii=False)+'\n' for x in rows));hashes[p.name]=hashlib.sha256(p.read_bytes()).hexdigest()
(R/'protocol.json').write_text(json.dumps(dict(hashes=hashes,parent='../requirements-draft-v11/adapter',steps=len(train),layers=13,seed=42,epochs=1,learning_rate=0.00001,gate='All 52 old/new acquisition targets correct; all prior successful v11 check answers retained. Fresh drafts exceed parent, numeric/general do not regress, literals 8/8. Every targeted decision must pass to claim reliability. No automatic release.',selection='One fixed run; acquisition-only repair allowed before candidate fresh inference.',limits='Synthetic small related sample; manual non-blind draft review.'),indent=2)+'\n')
(R/'rubric.json').write_text(json.dumps({x['id']:json.loads(x['messages'][-1]['content']) for x in checks if x['task']=='draft'},ensure_ascii=False,indent=2)+'\n')
print('Frozen:',len(train),'training rows;',len(acq),'acquisition targets;',len(checks),'fresh checks.')
