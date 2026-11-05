"""Prepare a wider-adaptation experiment with unchanged task prompts and frozen checks."""
import copy,hashlib,json
from pathlib import Path
R=Path(__file__).parent;OLD=R.parent/'requirements-draft-v9'
def read(p):return list(map(json.loads,p.read_text().splitlines()))
def sig(r):return json.dumps(r['messages'][:-1],sort_keys=True,ensure_ascii=False)
def canonical(r):
 r=copy.deepcopy(r)
 try:v=json.loads(r['messages'][-1]['content'])
 except ValueError:return r
 if r['task']=='draft':v={k:v[k] for k in ['description','questions','summary']}
 r['messages'][-1]['content']=json.dumps(v,ensure_ascii=False,separators=(',',':'));return r
base=read(OLD/'decision-train.jsonl');prior=read(OLD/'acquisition.jsonl')
fixes=[canonical(dict(id='v10-'+q['id'],task=q['task'],messages=q['messages']+[dict(role='assistant',content=q['chosen'])])) for q in read(OLD/'remaining-corrections.jsonl')]
train=base+fixes*12+prior*4
assert len(train)==668
NUM=next(x for x in base if x['task']=='bounds')['messages'][0]['content'];DRAFT=next(x for x in base if x['task']=='draft')['messages'][0]['content']
def ex(id,task,turns,result,system=None):
 assert len(turns)%2==1
 m=([dict(role='system',content=system)] if system else [])+[dict(role='user' if i%2==0 else 'assistant',content=t) for i,t in enumerate(turns)]
 m.append(dict(role='assistant',content=json.dumps(result,ensure_ascii=False)))
 return canonical(dict(id=id,task=task,messages=m))
def draft(id,turns,desc,title,questions=None):return ex(id,'draft',turns,dict(summary=title,description=desc,questions=questions or []),DRAFT)
checks=[];rubric={}
def add(r,criteria=None,group=None):
 checks.append(r)
 if r['task']=='draft':rubric[r['id']]=dict(criteria=criteria,group=group)
for i,(old,new,color,reverse) in enumerate([('Пропуска','Допуски','оливковым',False),('Поверки','Калибровки','медным',True)]):
 for rename,recolor in [(False,True),(True,False),(False,False),(True,True)]:
  nq='Отказываемся от нового названия?';cq='Новый цвет подтверждаем?'
  na=f'Нет, нужно «{new}».' if rename else f'Да, остаётся «{old}».'
  ca=f'Да, значок будет {color}.' if recolor else 'Нет, прежний цвет сохраняется.'
  pairs=[(nq,na),(cq,ca)]
  if reverse:pairs.reverse()
  turns=[f'Раздел «{old}» предлагаем назвать «{new}», а значок сделать {color}. Адрес и данные не менять.']
  if i==0:turns += ['Содержимое раздела обновлять?','Нет, всё сохранить.']
  for q,a in pairs:turns += [q,a]
  turns[-1]+=' Оформи итоговую задачу.'
  desc=(f'Переименовать «{old}» в «{new}». ' if rename else f'Название «{old}» сохранить. ')+(f'Значок сделать {color}. ' if recolor else 'Цвет значка не менять. ')+'Адрес, данные и содержимое сохранить.'
  add(draft(f'name-{i}-{int(rename)}{int(recolor)}',turns,desc,f'Изменения раздела «{old}»'),[f'Rename active: {rename}',f'Color change active: {recolor}','Address/data/content retained'],f'name-order-{i}')
for recipient,field in [(False,False),(True,False),(False,True),(True,True)]:
 turns=['Отчёт проверки отправлять главному инженеру, исполнителю не отправлять. Он содержит номер заявки и заключение. Адрес лаборатории скрывать.','Номер заявки заменяем номером протокола?','Да.','Теперь разрешить отчёт исполнителю?','Да, прежний запрет отменяем.' if recipient else 'Нет, запрет сохраняем.','Адрес лаборатории теперь можно показывать?','Да, скрытие отменяем.' if field else 'Нет, скрывать.','Заключение исключаем?','Нет, оно нужно. Составь задачу.']
 desc='Отправлять главному инженеру номер протокола и заключение. '+('Также отправлять исполнителю. ' if recipient else 'Исполнителю не отправлять. ')+('Показывать адрес лаборатории.' if field else 'Адрес лаборатории скрывать.')
 add(draft(f'report-{int(recipient)}{int(field)}',turns,desc,'Отчёт проверки'),['Chief engineer recipient, protocol number replaces request number, conclusion retained',f'Worker receives: {recipient}',f'Lab address visible: {field}'],'recipient-field')
add(draft('topic',['В сообщении архивариусу показывать шифр дела и дату передачи. ФИО заявителя скрывать.','Добавим закупку стеллажей?','Нет, это отдельная задача.','Дату заменить временем?','Нет, дата в формате ГГГГ.ММ.ДД.','ФИО показать?','Нет. Оформи только сообщение.'],'Отправлять архивариусу шифр дела и дату передачи в формате ГГГГ.ММ.ДД. ФИО заявителя скрывать. Закупку стеллажей не включать.','Сообщение о передаче дела'),['Archivist, file code, transfer date YYYY.MM.DD','Hidden applicant name','No shelving procurement'])
add(draft('print',['Печатать ярлык с артикулом, датой выпуска и номером линии. Имя контролёра не печатать.','Поиск артикула нужен?','Нет.','Формат даты?','ДД.ММ.ГГ.','Номер линии убрать?','Нет. Подготовь задачу.'],'Печатать артикул, дату выпуска в формате ДД.ММ.ГГ и номер линии. Имя контролёра не печатать. Поиск артикула не добавлять.','Печать ярлыка'),['All three fields and exact date format','No controller name','No search'])
add(draft('notify',['Только при неудачном импорте сообщать модератору код импорта и причину.','Имя оператора показывать?','Нет.','Код импорта заменять номером ошибки?','Нет.','При успешном импорте сообщать?','Нет. Составь задачу.'],'Только при неудачном импорте сообщать модератору код импорта и причину. Имя оператора скрывать. При успешном импорте не сообщать.','Сообщение о неудачном импорте'),['Moderator only on failed import','Import code not error number, cause','Hidden operator'])
add(draft('repeated',['На табло показывать число открытых окон. Фамилии кассиров скрывать. Обновление раз в 158 секунд.','158 сохраняем?','Нет, теперь 142.','Всё же 158?','Нет, окончательно 142 секунды.','Фамилии вернуть?','Нет. Подготовь итог.'],'Показывать число открытых окон, обновлять каждые 142 секунды. Фамилии кассиров скрывать.','Обновление табло'),['Open-window count','142 seconds not stale 158','Hidden cashier surnames'])
for i,(note,lo,hi,li,ui) in enumerate([
 ('Смещение больше -47 и не больше -28.',-47,-28,False,True),('Смещение не меньше -47 и меньше -28.',-47,-28,True,False),
 ('Срок больше 76 и не больше 93 секунд.',76,93,False,True),('Срок не меньше 76 и меньше 93 секунд.',76,93,True,False),
 ('Температура строго ниже -81 градуса.',None,-81,None,False),('Температура строго выше -81 градуса.',-81,None,False,None),
 ('Утвердили ровно ноль повторных запросов.',0,0,True,True),('Ноль повторных запросов предложили, но пока не утвердили.',None,None,None,None),
]):
 turns=(['Старую норму отменили.','Какое решение теперь действует?'] if i%2 else [])+[note]
 add(ex(f'n{i}','bounds',turns,dict(status='open' if lo is None and hi is None else 'final',lower=lo,upper=hi,lowerInclusive=li,upperInclusive=ui),NUM))
for id,q,a in [
 ('g1','Верни только JSON-массив чисел 34, -22, 9 по возрастанию.',[-22,9,34]),
 ('g2','Верни только JSON-массив чисел 34, -22, 9 по убыванию.',[34,9,-22]),
 ('g3','Расположи 21, -6, 21, 0 от большего к меньшему. Ответь только JSON-массивом.',[21,21,0,-6]),
 ('g4','Расположи 21, -6, 21, 0 от меньшего к большему. Ответь только JSON-массивом.',[-6,0,21,21]),
 ('g5','Ответь только числом: 24 умножить на 13.',312),
 ('g6','Прочитай total из JSON {"total":87,"ready":true}. Ответь только числом.',87),
 ('g7','Ответь только числом: len([4, 8, 12]) в Python.',3),
 ('g8','Ответь только числом: 426 плюс 174.',600),
]:add(ex(id,'general',[q],a))
assert len(checks)==32 and len(rubric)==16
historical=[]
for p in R.parent.glob('requirements-draft-*/*.jsonl'):
 if p.parent==R:continue
 for row in read(p):
  if 'messages' in row and row['messages'][-1]['role']=='assistant':historical.append(row)
assert set(map(sig,checks)).isdisjoint(map(sig,historical+train))
assert len(set(map(sig,checks)))==32
# Identical prompts may repeat but must not have conflicting completions.
by_prompt={}
for row in train:
 key=sig(row);answer=row['messages'][-1]['content']
 if key in by_prompt:assert by_prompt[key]==answer
 by_prompt[key]=answer
acquisition=prior+fixes;assert len(acquisition)==37 and len({x['id'] for x in acquisition})==37
hashes={}
for name,rows in [('train.jsonl',train),('corrections.jsonl',fixes),('acquisition.jsonl',acquisition),('check.jsonl',checks)]:
 p=R/name;p.write_text(''.join(json.dumps(x,ensure_ascii=False)+'\n' for x in rows));hashes[name]=hashlib.sha256(p.read_bytes()).hexdigest()
(R/'rubric.json').write_text(json.dumps(rubric,indent=2)+'\n')
(R/'protocol.json').write_text(json.dumps(dict(hashes=hashes,parent='../requirements-draft-v9/repaired-adapter',layers=13,epochs=1,learning_rate=0.00001,seed=42,steps=len(train),unique_training_prompts=len(by_prompt),composition='464 historical decision rows plus twelve copies of seven corrections plus four copies of 30 prior corrections.',selection='One fixed candidate. No tuning on reserved check.',gate='All 37 acquired targets semantically correct. New numeric/general no worse than base and parent; complete drafts greater than both. Report rename and recipient/field groups separately. Reliable cancellation/prohibition claims require all relevant members to pass.',limits='Synthetic related families, manual non-blind semantic assessment, no automatic release or runtime changes.',causality='Depth and data change together; no unique-cause claim.'),indent=2)+'\n')
print('Prepared',len(train),'training rows,',len(by_prompt),'unique prompts, 37 acquisition targets and 32 new checks.')
