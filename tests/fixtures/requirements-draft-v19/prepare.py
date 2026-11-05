"""Freeze all-block adaptation with balanced semantic controls."""
import hashlib,json
from pathlib import Path
R=Path(__file__).parent
OLD=R.parent/'requirements-draft-v18'
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
  row['id']='v19-'+row['id'];acq.append(row)
assert len(acq)==569 and len(set(map(sig,acq)))==569
systems={t:next(x['messages'][0]['content'] for x in acq if x['task']==t) for t in ['draft','bounds']}
variants=[]
for first in [False,True]:
 for second in [False,True]:
  bits=f'{int(first)}{int(second)}'
  variants.append(draft('send-'+bits,['Два письма: инспектору и подрядчику. Оба содержат номер проверки, без вложений. Разрешаю обе отправки.','Разрешение инспектору остаётся?', 'Да.' if first else 'Нет, отзываю.','Подрядчику?', 'Да, отправку подтверждаю.' if second else 'Нет, отправку отменяю.','Вложения нужны?','Нет, запрет остаётся. Оформи два решения.'],'Подготовить два письма с номером проверки без вложений. '+('Инспектору отправка разрешена. ' if first else 'Инспектору не отправлять, сохранить черновиком. ')+('Подрядчику отправка разрешена.' if second else 'Подрядчику не отправлять, сохранить черновиком.'),'Два письма'))
  variants.append(draft('field-'+bits,['В отчёте заменить source_id на check_id и author_id на inspector_id.','Первую замену отменить?', 'Нет, check_id нужен.' if first else 'Да, оставить source_id.','А вторую отменить?', 'Нет, inspector_id нужен.' if second else 'Да, оставить author_id.','Менять базу?','Нет, только отчёт. Оформи.'],f'В отчёте использовать {"check_id вместо source_id" if first else "source_id без замены"} и {"inspector_id вместо author_id" if second else "author_id без замены"}. Базу данных не изменять.','Поля отчёта'))
  questions=[]
  if not first:questions.append('Кому отправить справку?')
  if not second:questions.append('Через какой канал отправить справку?')
  variants.append(ex('unknown-'+bits,'draft',['Подготовить справку с номером проверки. Пока не отправлять.','Получатель определён?', 'Да, диспетчер.' if first else 'Нет, не выбирай за меня.','Канал определён?', 'Да, email.' if second else 'Нет, Telegram не утверждал.','Как оформить?', 'Запиши согласованное и вопросы о том, что не выбрано. До отдельного подтверждения отправку не выполнять.'],{'description':'Подготовить справку с номером проверки. '+('Получатель — диспетчер. ' if first else 'Получатель не выбран. ')+('Канал — email. ' if second else 'Канал не выбран. ')+'До отдельного подтверждения ничего не отправлять.','questions':questions,'summary':'Подготовка справки'}))
  variants.append(draft('export-'+bits,['Ручной экспорт журнала. Поля ещё не обсуждали.','Формат CSV?', 'Да, только CSV.' if first else 'Нет, только JSON.','Сжать в ZIP?', 'Да, это утверждаю.' if second else 'Нет, ZIP не добавлять.','Добавить статус и результат?', 'Нет, не придумывай состав полей. В задаче сохрани, что он ещё не согласован.'],f'Реализовать ручной экспорт журнала в {"CSV" if first else "JSON"}. '+('Результат упаковывать в ZIP. ' if second else 'ZIP не добавлять. ')+'Состав полей не согласован; статус и результат не добавлять.','Экспорт журнала'))
  variants.append(draft('range-'+bits,['Раньше допуск от -40 до -10 включительно.','Новые границы?',f'От -33 {"включительно" if first else "не включительно"} до -13 {"включительно" if second else "не включительно"}.','Старые границы оставить?','Нет.','Дроби округлять?','Нет. Укажи точные условия.'],f'Принимать значения {"не меньше" if first else "строго больше"} -33 и {"не больше" if second else "строго меньше"} -13. Старые границы отменены. Дроби не округлять.','Проверка диапазона'))
  values=[-22,-7,-14,-7];answer=sorted(values if second else set(values),reverse=first)
  variants.append(draft('sorting-'+bits,['Список -22, -7, -14, -7 нужно отсортировать.','По убыванию?', 'Да, по убыванию.' if first else 'Нет, по возрастанию.','Повторы оставлять?', 'Да, каждый повтор сохранить.' if second else 'Нет, оставить только уникальные значения.','Что указать в задаче?','Правило и полный результат.'],f'Сортировать по {"убыванию" if first else "возрастанию"}. '+('Повторы сохранять. ' if second else 'Повторы удалять. ')+'Результат: '+', '.join(map(str,answer))+'.','Сортировка чисел'))
  variants.append(draft('scope-'+bits,['При ошибке проверки сообщать аналитику номер проверки и причину.','Почту автора показывать?', 'Да.' if first else 'Нет, скрывать.','Закупку компьютера включить сюда?', 'Да, включить отдельным пунктом в эту задачу.' if second else 'Нет, это отдельная задача, сюда не включать.','При успехе уведомлять?','Нет. Оформи без добавлений.'],'Только при ошибке проверки сообщать аналитику номер проверки и причину. '+('Показывать почту автора. ' if first else 'Скрывать почту автора. ')+('Закупку компьютера включить отдельным пунктом. ' if second else 'Закупку компьютера в задачу не включать. ')+'При успехе не уведомлять.','Уведомление о проверке'+(' и закупка' if second else '')))
  variants.append(ex('token-'+bits,'draft',['Нужен токен доступа к документу.','Повторное использование разрешить?', 'Да, повторно использовать можно.' if first else 'Нет, только одно использование.','Срок 107 секунд?', 'Да, утверждаю.' if second else 'Нет, срок ещё не выбран.','Привязать к входу в аккаунт?','Нет, это доступ к документу, не аутентификация. Запиши условия и оставшийся вопрос, если он есть.'],{'description':'Реализовать токен доступа к документу. '+('Повторное использование разрешено. ' if first else 'Токен одноразовый; повторное использование запрещено. ')+('Срок действия 107 секунд. ' if second else 'Срок действия не согласован. ')+'К входу в аккаунт и аутентификации не привязывать.','questions':[] if second else ['Какой срок действия токена установить?'],'summary':'Доступ к документу'}))
for row in variants:
 if row['id'].startswith('export-'):
  row['messages'][-2]['content']+=' Спроси, какие поля включить.'
  answer=json.loads(row['messages'][-1]['content']);answer['questions']=['Какие поля включить в экспорт?']
  row['messages'][-1]['content']=json.dumps(answer,ensure_ascii=False,separators=(',',':'))
assert len(variants)==32
release_ids={'v19-'+x['id'] for x in read(OLD/'release-dialogues.jsonl')}
release_rehearsal=[x for x in acq if x['id'] in release_ids]
train=acq+read(OLD/'diverse-variants.jsonl')*2+variants*3+release_rehearsal*4+read(R.parent/'requirements-draft-v12/numeric-rehearsal.jsonl')+read(R.parent/'requirements-draft-v15/negative-variants.jsonl')
checks=names('name',[('Счёт-079','Расчёт-079','оливковым'),('Заявки-083','Обращения-083','коралловым')])
checks+=reports('report',[('диспетчеру','покупателю','телефон оценщика','код отгрузки','код доставки'),('координатору','подрядчику','адрес аналитика','номер запроса','номер заключения')],1)
checks+=replacement('polarity',[('контролёру','заказчику','почту консультанта','код декларации','код ревизии'),('заведующему','арендатору','телефон эксперта','номер отгрузки','номер доставки')],True)
checks+=failures('failure',[('проверки архива','диспетчеру','номер пакета','имя проверяющего')])
checks+=[draft('scope',['Сообщение секретарю: номер заключения и дата. Имя автора скрывать.','Добавить закупку клавиатуры?','Нет, это другая задача.','Формат даты?','ГГГГ.ММ.ДД.','Имя автора вернуть?','Нет. Составь задачу.'],'Отправлять секретарю номер заключения и дату в формате ГГГГ.ММ.ДД. Имя автора скрывать. Закупку клавиатуры не включать.','Сообщение об акте'),draft('repeat',['Показывать число согласованных актов. Имена рецензентов скрывать. Интервал 307 секунды.','307 остаётся?','Нет, 293.','Вернуть прежний интервал?','Нет, окончательно 293.','Раскрыть имена?','Нет. Оформи.'],'Показывать число согласованных актов каждые 293 секунду. Имена рецензентов скрывать.','Счётчик записей')]
checks+=value_pairs('value',[-181,-193,-0.9375,-29.875])
for i,(li,ui) in enumerate([(False,False),(False,True),(True,False),(True,True)]):
 checks.append(bound(f'interval-{i}',['Раньше согласовали от 12 до 18.','Сохраняем?','Нет, это отменено.','Что утверждено теперь?',f'Значение {"не меньше" if li else "больше"} -127 и {"не больше" if ui else "меньше"} -81.'],-127,-81,li,ui))
checks+=sorts('sort',[[-71,-23,-42],[-102,-39,-68],[-54,-11,-54,-29],[-0.9375,-9.9375,-5.9375],[-158,-41,-91],[13.75,-9.75,5.75]])
for i,(q,a) in enumerate([('Ответь только числом: 33 умножить на 19.',627),('Прочитай items из JSON {"items":191,"ok":true}. Ответь только числом.',191),('Ответь только числом: len([15, 30, 45, 60, 75, 90, 105, 120]) в Python.',8),('Ответь только числом: 407 плюс 593.',1000)]):checks.append(ex(f'g{i}','general',[q],a))


assert len(checks)==84 and len(train)==913
historical=[]
for p in R.parent.glob('requirements-draft-*/*.jsonl'):
 if p.parent!=R:historical += [x for x in read(p) if 'messages' in x]
assert set(map(sig,checks)).isdisjoint(map(sig,historical+train))
by={}
for row in train:
 k=sig(row);v=json.loads(row['messages'][-1]['content'])
 if k in by:assert by[k]==v
 by[k]=v
hashes={}
for name,rows in [('train',train),('acquisition',acq),('semantic-variants',variants),('check',checks)]:
 p=R/(name+'.jsonl');p.write_text(''.join(json.dumps(x,ensure_ascii=False)+'\n' for x in rows));hashes[p.name]=hashlib.sha256(p.read_bytes()).hexdigest()
(R/'protocol.json').write_text(json.dumps(dict(hashes=hashes,parent='../requirements-draft-v18/question-adapter',steps=len(train),layers=32,epochs=1,seed=42,learning_rate=0.000005,gate='Retain all 569 familiar cases. No lost parent successes on independent structured and diverse checks; bounds/sorts/names/permissions preserved. Runtime integration and generated live dialogue remain required for release.',selection='Fixed full run from selected v18 parent, never probe weights. Acquisition-only repair requires a new frozen protocol before candidate fresh inference.',limits='Capacity and data both change; no isolated causal conclusion. Synthetic non-blind evaluation.'),indent=2)+'\n')
print(len(train),len(acq),len(checks))
