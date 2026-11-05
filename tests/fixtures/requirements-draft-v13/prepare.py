"""Freeze paired exact-value and recipient-permission repair with full retention."""
import copy,hashlib,json
from pathlib import Path
R=Path(__file__).parent;OLD=R.parent/'requirements-draft-v12'
def read(p):return list(map(json.loads,p.read_text().splitlines()))
def sig(r):return json.dumps(r['messages'][:-1],ensure_ascii=False,sort_keys=True)
def clean(r):return {k:copy.deepcopy(v) for k,v in r.items() if k in ['id','task','messages','required_literals']}
prior=read(OLD/'repair-acquisition.jsonl');last=read(OLD/'check.jsonl')
for r in last:r['id']='v13-'+r['id']
acq=prior+last
assert len(acq)==117 and len(set(map(sig,acq)))==117
fix_ids={'v13-report-0-10','v13-exact-0'};fixes=[x for x in last if x['id'] in fix_ids]
systems={t:next(x['messages'][0]['content'] for x in acq if x['task']==t) for t in ['bounds','draft']}
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
variants=value_pairs('value',[-101,-67,-0.5,-13.25])
variants+=reports('permission',[('руководителю','арендатору','адрес мастера','код заявки','код осмотра'),('куратору','участнику','телефон проверяющего','номер обращения','номер согласования')],1)
train=acq*2+fixes*16+read(OLD/'numeric-rehearsal.jsonl')+read(OLD/'variants.jsonl')[:32]+variants*2
assert len(train)==410
checks=names('name',[('Пропуска-11','Допуски-11','лимонным'),('Счёты-12','Расчёты-12','бордовым')])
checks+=reports('report',[('заведующему','поставщику','адрес проверяющего','код заявки','код приёмки'),('координатору','организатору','телефон эксперта','номер обращения','номер экспертизы')],1)
checks+=failures('failure',[('переноса','оператору','номер переноса','имя исполнителя')])
checks += [draft('scope',['Сообщение секретарю: код заседания и дата. Имя посетителя скрывать.','Добавить покупку микрофона?','Нет, это отдельная задача.','Формат даты?','ММ/ДД/ГГГГ.','Имя вернуть?','Нет. Оформи сообщение.'],'Отправлять секретарю код заседания и дату в формате ММ/ДД/ГГГГ. Имя посетителя скрывать. Покупку микрофона не включать.','Сообщение о заседании'),draft('repeat',['Показывать число закрытых заявок. Имена авторов скрыты. Обновлять раз в 197 секунд.','197 оставляем?','Нет, 181.','Вернуть 197?','Нет, окончательно 181.','Имена показать?','Нет. Оформи.'],'Показывать число закрытых заявок. Имена авторов скрывать. Обновлять каждые 181 секунду.','Счётчик заявок')]
checks+=value_pairs('value',[-109,-71,-0.75,-14.5])
for i,(li,ui) in enumerate([(False,False),(False,True),(True,False),(True,True)]):
 note=f'Значение {"не меньше" if li else "больше"} -86 и {"не больше" if ui else "меньше"} -62.'
 checks.append(bound(f'interval-{i}',['Раньше было от 7 до 12.','Оставить?','Нет, отменено.','Какие границы утверждены?',note],-86,-62,li,ui))
for i,(q,a) in enumerate([('Верни JSON-массив 46, -29, 17 по возрастанию.',[-29,17,46]),('Верни JSON-массив 46, -29, 17 по убыванию.',[46,17,-29]),('Отсортируй 26, -8, 26, 0 от большего к меньшему. Только JSON-массив.',[26,26,0,-8]),('Отсортируй 26, -8, 26, 0 от меньшего к большему. Только JSON-массив.',[-8,0,26,26]),('Ответь только числом: 24 умножить на 17.',408),('Прочитай items из JSON {"items":83,"ok":true}. Ответь только числом.',83),('Ответь только числом: len([4, 8, 12, 16, 20, 24, 28, 32]) в Python.',8),('Ответь только числом: 367 плюс 433.',800)]):checks.append(ex(f'g{i}','general',[q],a))
assert len(checks)==48
historical=[]
for p in R.parent.glob('requirements-draft-*/*.jsonl'):
 if p.parent==R:continue
 historical += [x for x in read(p) if 'messages' in x and x['messages'][-1]['role']=='assistant']
assert set(map(sig,checks)).isdisjoint(map(sig,historical+train))
assert len(set(map(sig,checks)))==48
by_prompt={}
for row in train:
 key=sig(row);answer=json.loads(row['messages'][-1]['content'])
 if key in by_prompt:assert by_prompt[key]==answer
 by_prompt[key]=answer
hashes={}
for name,rows in [('train',train),('acquisition',acq),('corrections',fixes),('variants',variants),('check',checks)]:
 p=R/(name+'.jsonl');p.write_text(''.join(json.dumps(x,ensure_ascii=False)+'\n' for x in rows));hashes[p.name]=hashlib.sha256(p.read_bytes()).hexdigest()
(R/'rubric.json').write_text(json.dumps({x['id']:json.loads(x['messages'][-1]['content']) for x in checks if x['task']=='draft'},ensure_ascii=False,indent=2)+'\n')
(R/'protocol.json').write_text(json.dumps(dict(hashes=hashes,parent='../requirements-draft-v12/repaired-adapter',steps=len(train),layers=13,epochs=1,seed=42,learning_rate=0.000005,gate='All 117 familiar targets correct after reload. Fresh complete drafts improve versus parent, literals 8/8, no individual previously correct fresh case regresses. Every targeted state must pass to claim reliability; no automatic release.',selection='One fixed candidate; acquisition-only repair permitted before fresh candidate inference.',limits='Synthetic related small cases, manual non-blind semantic review.'),indent=2)+'\n')
print('Frozen:',len(train),'training rows;',len(acq),'retention cases;',len(checks),'fresh checks.')
