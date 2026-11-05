"""Freeze balanced sort directions and permission states with full retention."""
import copy,hashlib,json
from pathlib import Path
R=Path(__file__).parent;OLD=R.parent/'requirements-draft-v13'
def read(p):return list(map(json.loads,p.read_text().splitlines()))
def sig(r):return json.dumps(r['messages'][:-1],ensure_ascii=False,sort_keys=True)
prior=read(OLD/'acquisition.jsonl');last=read(OLD/'check.jsonl')
for r in last:r['id']='v14-'+r['id']
acq=prior+last
assert len(acq)==165 and len(set(map(sig,acq)))==165
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
sort_train=sorts('sort',[[51,-23,14],[32,-12,32,0],[-44,-6,-19],[9,0,-9,9],[3.5,-1.5,0.5],[61,28,-37],[0,-2,0,5],[-17,-81,-43]])
report_train=reports('permission',[('директору','партнёру','адрес аудитора','номер запроса','номер аудита'),('менеджеру','клиенту','телефон инспектора','код обращения','код проверки'),('секретарю','делегату','почту эксперта','номер заявки','номер заключения'),('мастеру','заказчику','имя контролёра','код заказа','код испытания')],1)
pairs=[x for x in last if x['id'].startswith('v14-report-0-') or x['id'] in ['v14-g0','v14-g1']]
assert len(pairs)==6
train=acq*2+pairs*8+sort_train*2+report_train*2+read(R.parent/'requirements-draft-v12/numeric-rehearsal.jsonl')
assert len(train)==538
checks=names('name',[('Пропуска-15','Допуски-15','мятным'),('Счёты-16','Расчёты-16','янтарным')])
checks+=reports('report',[('инспектору','владельцу','почту оценщика','код обращения','код оценки'),('управляющему','подрядчику','адрес техника','номер запроса','номер осмотра')],1)
checks+=failures('failure',[('публикации','редактору','номер публикации','имя автора')])
checks += [draft('scope',['Сообщение администратору: номер визита и дата. Имя гостя скрывать.','Добавить покупку камеры?','Нет, это отдельная задача.','Формат даты?','ГГГГ-ДД-ММ.','Имя вернуть?','Нет. Оформи сообщение.'],'Отправлять администратору номер визита и дату в формате ГГГГ-ДД-ММ. Имя гостя скрывать. Покупку камеры не включать.','Сообщение о визите'),draft('repeat',['Показывать число обработанных файлов. Имена владельцев скрыты. Обновлять раз в 211 секунд.','211 оставляем?','Нет, 193.','Вернуть 211?','Нет, окончательно 193.','Имена показать?','Нет. Оформи.'],'Показывать число обработанных файлов. Имена владельцев скрывать. Обновлять каждые 193 секунды.','Счётчик файлов')]
checks+=value_pairs('value',[-113,-79,-0.625,-16.75])
for i,(li,ui) in enumerate([(False,False),(False,True),(True,False),(True,True)]):
 note=f'Значение {"не меньше" if li else "больше"} -92 и {"не больше" if ui else "меньше"} -68.'
 checks.append(bound(f'interval-{i}',['Раньше было от 8 до 13.','Оставить?','Нет, отменено.','Какие границы утверждены?',note],-92,-68,li,ui))
checks+=sorts('sort',[[54,-33,21],[35,-11,35,0],[-47,-9,-22],[4.5,-2.5,1.5]])
for i,(q,a) in enumerate([('Ответь только числом: 26 умножить на 18.',468),('Прочитай items из JSON {"items":79,"ok":true}. Ответь только числом.',79),('Ответь только числом: len([5, 10, 15, 20, 25, 30, 35, 40, 45]) в Python.',9),('Ответь только числом: 384 плюс 516.',900)]):checks.append(ex(f'g{i}','general',[q],a))
assert len(checks)==60
historical=[]
for p in R.parent.glob('requirements-draft-*/*.jsonl'):
 if p.parent==R:continue
 historical += [x for x in read(p) if 'messages' in x and x['messages'][-1]['role']=='assistant']
assert set(map(sig,checks)).isdisjoint(map(sig,historical+train))
assert len(set(map(sig,checks)))==60
by_prompt={}
for row in train:
 key=sig(row);answer=json.loads(row['messages'][-1]['content'])
 if key in by_prompt:assert by_prompt[key]==answer
 by_prompt[key]=answer
hashes={}
for name,rows in [('train',train),('acquisition',acq),('balanced-corrections',pairs),('sort-variants',sort_train),('report-variants',report_train),('check',checks)]:
 p=R/(name+'.jsonl');p.write_text(''.join(json.dumps(x,ensure_ascii=False)+'\n' for x in rows));hashes[p.name]=hashlib.sha256(p.read_bytes()).hexdigest()
(R/'rubric.json').write_text(json.dumps({x['id']:json.loads(x['messages'][-1]['content']) for x in checks if x['task']=='draft'},ensure_ascii=False,indent=2)+'\n')
(R/'protocol.json').write_text(json.dumps(dict(hashes=hashes,parent='../requirements-draft-v13/repaired-adapter',steps=len(train),layers=13,epochs=1,seed=42,learning_rate=0.000005,gate='All 165 familiar cases correct after reload. Improve fresh drafts versus parent, labels 8/8, all 20 fresh numerical cases correct, and no previously correct fresh case regresses. Every decision state must pass to claim reliability; no automatic release.',selection='Fixed run, acquisition-only repair allowed before candidate fresh inference.',limits='Small related synthetic sample; non-blind semantic draft assessment.'),indent=2)+'\n')
print('Frozen:',len(train),'training rows;',len(acq),'retention targets;',len(checks),'fresh checks.')
