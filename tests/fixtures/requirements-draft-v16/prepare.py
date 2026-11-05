"""Freeze consistent-recipient repair with balanced states and fresh polarity checks."""
import hashlib,json
from pathlib import Path
R=Path(__file__).parent;OLD=R.parent/'requirements-draft-v15'
def read(p):return list(map(json.loads,p.read_text().splitlines()))
def sig(r):return json.dumps(r['messages'][:-1],ensure_ascii=False,sort_keys=True)
prior=read(OLD/'acquisition.jsonl');last=read(OLD/'check.jsonl')
for row in last:row['id']='v16-'+row['id']
acq=prior+last
assert len(acq)==293 and len(set(map(sig,acq)))==293
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
vocab=[('администратору','арендатору','почту техника','код заявки','код проверки'),('руководителю','исполнителю','телефон аудитора','номер запроса','номер заключения')]
variants=[]
for order in [0,1]:
 for style in [0,1]:variants+=reports(f'permission-{order}-{style}',vocab if not order else list(reversed(vocab)),style)
for i,(main,other,field,oldcode,newcode) in enumerate(vocab+[('инспектору','клиенту','адрес эксперта','код обращения','код осмотра')]):
 for allow,show in [(False,False),(True,False),(False,True),(True,True)]:
  turns=[f'Отчёт: {newcode} и результат. Отправлять {main}.',f'Отправлять {main} и {other}, но {other} не отправлять. Показывать и скрывать {field}.',f'Убери противоречия. '+(f'Отправлять {main} и {other}. ' if allow else f'Только {main}, {other} не отправлять. ')+(f'Показывать {field}.' if show else f'Скрывать {field}.')+' Сохрани оба поля отчёта.']
  desc=f'Отчёт с полями «{newcode}» и «результат» отправлять {main}'+(f' и {other}. ' if allow else f'. {other.capitalize()} не отправлять. ')+(f'Показывать {field}.' if show else f'Скрывать {field}.')
  variants.append(draft(f'consistent-{i}-{int(allow)}{int(show)}',turns,desc,'Согласованная отправка отчёта'))
assert len(variants)==44
pairs=[x for x in last if x['id'].startswith('v16-report-1-')];assert len(pairs)==4
train=acq+pairs*12+variants*2+read(R.parent/'requirements-draft-v12/numeric-rehearsal.jsonl')+read(OLD/'negative-variants.jsonl')
assert len(train)==541
checks=names('name',[('Пропуска-23','Допуски-23','изумрудным'),('Счёты-24','Расчёты-24','рубиновым')])
checks+=reports('report',[('начальнику отдела','заявителю','почту инженера','код обращения','код экспертизы'),('куратору','подрядчику','телефон ревизора','номер заявки','номер согласования')],1)
checks+=failures('failure',[('вычисления','оператору','номер вычисления','имя аналитика')])
checks += [draft('scope',['Сообщение секретарю: номер заявки и дата. Имя заявителя скрывать.','Добавить покупку принтера?','Нет, это отдельная задача.','Формат даты?','ММ-ГГГГ-ДД.','Имя вернуть?','Нет. Оформи сообщение.'],'Отправлять секретарю номер заявки и дату в формате ММ-ГГГГ-ДД. Имя заявителя скрывать. Покупку принтера не включать.','Сообщение о заявке'),draft('repeat',['Показывать число согласованных документов. Имена авторов скрыты. Обновлять раз в 239 секунд.','239 оставляем?','Нет, 217.','Вернуть 239?','Нет, окончательно 217.','Имена показать?','Нет. Оформи.'],'Показывать число согласованных документов. Имена авторов скрывать. Обновлять каждые 217 секунд.','Счётчик документов')]
for i,(main,other,field,oldcode,newcode) in enumerate([('контролёру','заказчику','адрес оценщика','код заявления','код контроля'),('заведующему','партнёру','почту эксперта','номер заказа','номер проверки')]):
 for allow,show in [(False,False),(True,False),(False,True),(True,True)]:
  pairs2=[(f'Запрет на отправку {other} остаётся?',f'Нет, снять его: {other} тоже отправлять.' if allow else f'Да, оставить: {other} не отправлять.'),(f'Продолжаем скрывать {field}?','Нет, теперь показывать.' if show else 'Да, скрывать.')]
  if i:pairs2.reverse()
  turns=[f'Сводку отправлять {main}, {other} не отправлять. В сводке {oldcode} и результат. Скрывать {field}.','Старый идентификатор оставить?',f'Нет, использовать {newcode}.']
  for q,a in pairs2:turns +=[q,a]
  turns+=['Результат удалить?','Нет, результат сохранить. Составь задачу.']
  desc=f'Сводку с полями «{newcode}» и «результат» отправлять {main}'+(f' и {other}. ' if allow else f'. {other.capitalize()} не отправлять. ')+(f'Показывать {field}.' if show else f'Скрывать {field}.')
  checks.append(draft(f'polarity-{i}-{int(allow)}{int(show)}',turns,desc,'Отправка сводки'))
checks+=value_pairs('value',[-137,-89,-0.375,-19.75])
for i,(li,ui) in enumerate([(False,False),(False,True),(True,False),(True,True)]):
 note=f'Значение {"не меньше" if li else "больше"} -98 и {"не больше" if ui else "меньше"} -77.'
 checks.append(bound(f'interval-{i}',['Раньше было от 10 до 15.','Оставить?','Нет, отменено.','Какие границы утверждены?',note],-98,-77,li,ui))
checks+=sorts('sort',[[-61,-15,-32],[-78,-23,-52],[-36,-8,-36,-19],[-0.375,-6.375,-2.375],[-124,-27,-73],[7.75,-4.75,0.75]])
for i,(q,a) in enumerate([('Ответь только числом: 28 умножить на 17.',476),('Прочитай items из JSON {"items":71,"ok":true}. Ответь только числом.',71),('Ответь только числом: len([9, 18, 27, 36, 45, 54]) в Python.',6),('Ответь только числом: 438 плюс 562.',1000)]):checks.append(ex(f'g{i}','general',[q],a))
assert len(checks)==76
historical=[]
for p in R.parent.glob('requirements-draft-*/*.jsonl'):
 if p.parent==R:continue
 historical += [x for x in read(p) if 'messages' in x and x['messages'][-1]['role']=='assistant']
assert set(map(sig,checks)).isdisjoint(map(sig,historical+train))
assert len(set(map(sig,checks)))==76
by={}
for row in train:
 k=sig(row);v=json.loads(row['messages'][-1]['content'])
 if k in by:assert by[k]==v
 by[k]=v
hashes={}
for name,rows in [('train',train),('acquisition',acq),('balanced-corrections',pairs),('consistent-variants',variants),('check',checks)]:
 p=R/(name+'.jsonl');p.write_text(''.join(json.dumps(x,ensure_ascii=False)+'\n' for x in rows));hashes[p.name]=hashlib.sha256(p.read_bytes()).hexdigest()
(R/'rubric.json').write_text(json.dumps({x['id']:json.loads(x['messages'][-1]['content']) for x in checks if x['task']=='draft'},ensure_ascii=False,indent=2)+'\n')
(R/'protocol.json').write_text(json.dumps(dict(hashes=hashes,parent='../requirements-draft-v15/adapter',steps=len(train),layers=13,epochs=1,seed=42,learning_rate=0.000005,gate='All 293 familiar cases correct. Fresh permission handling improves versus parent without losing any prior successful fresh case. Numeric 20/20, labels 8/8, preserve sorting. Contradictory requirements fail even if a correct prohibition is appended. All states must pass to claim complete coverage; no automatic release.',selection='Fixed run; acquisition-only repair permitted before candidate fresh inference.',limits='Small related synthetic sample; manual non-blind draft review. New polarity cases frozen before all inference.'),indent=2)+'\n')
print('Frozen:',len(train),'training rows;',len(acq),'retention targets;',len(checks),'fresh checks.')
