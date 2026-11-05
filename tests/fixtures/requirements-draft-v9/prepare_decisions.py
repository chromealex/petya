"""Expand question polarity and decision order; freeze a second transfer check."""
import hashlib,json,runpy
from pathlib import Path
R=Path(__file__).parent
v=runpy.run_path(str(R/'prepare.py'));read=v['read'];draft=v['draft'];bounds=v['bounds'];example=v['example'];sig=v['signature']
rename=[]
objects=[('Персонал','Команда','фиолетовым'),('Закупки','Заказы','серебристым'),('Сессии','Встречи','оранжевым'),('Клиенты','Покупатели','тёмно-зелёным')]
queries=[('Отменить переименование?','Отменить смену цвета?',True),('Новое имя оставить?','Новый цвет оставить?',False),('Вернуть старое название?','Вернуть прежний цвет?',True),('Переименовываем раздел?','Перекрашиваем значок?',False)]
for i,(old,new,color) in enumerate(objects):
 for j,(nq,cq,negative) in enumerate(queries):
  for name_on in [False,True]:
   for color_on in [False,True]:
    na=('Нет' if name_on else 'Да') if negative else ('Да' if name_on else 'Нет')
    ca=('Нет' if color_on else 'Да') if negative else ('Да' if color_on else 'Нет')
    na+=f', новое название «{new}» оставляем.' if name_on else f', остаётся старое название «{old}».'
    ca+=f', значок должен стать {color}.' if color_on else ', сохраняем прежний цвет значка.'
    desc=(f'Переименовать «{old}» в «{new}». ' if name_on else f'Название «{old}» сохранить. ')+(f'Значок сделать {color}. ' if color_on else 'Цвет значка не менять. ')+'Адрес, данные и содержимое сохранить.'
    for reverse in [False,True]:
     pairs=[(nq,na),(cq,ca)]
     if reverse:pairs.reverse()
     turns=[f'Раздел «{old}» назовём «{new}», значок сделаем {color}. Адрес, данные и содержимое не меняем.']
     for q,a in pairs:turns += [q,a]
     turns+=['Адрес и данные остаются?','Да, всё содержимое тоже сохранить. Оформи итог.']
     rename.append(draft(f'decision-{i}-{j}-{int(name_on)}{int(color_on)}-{int(reverse)}',turns,desc,f'Изменения раздела «{old}»'))
assert len(rename)==128
sorting=[]
arrays=[[31,-15,7],[42,3,-21],[6,-19,22],[15,-8,0],[33,5,-4],[2,18,-27],[10,-6,24],[17,1,-13],[4,4,-7],[0,9,-2],[-5,-16,-1],[12,8,30],[11,-25,3],[19,0,-10],[26,-9,5],[7,-18,14]]
for i,a in enumerate(arrays):
 for descending in [False,True]:
  for wording in [0,1]:
   direction=('убыванию' if descending else 'возрастанию') if wording==0 else ('от большего к меньшему' if descending else 'от меньшего к большему')
   question=(f'Верни только JSON-массив чисел {", ".join(map(str,a))} по {direction}.' if wording==0 else f'Расположи числа {", ".join(map(str,a))} {direction}. Верни только один JSON-массив.')
   sorting.append(example(f'sort-decision-{i}-{int(descending)}-{wording}','general',[question],sorted(a,reverse=descending)))
assert len(sorting)==64
ban=[x for x in read(R/'variants.jsonl') if x['id'].startswith('report-')]
oldgeneral={sig(x):x for x in read(R.parent/'requirements-draft-v8/stabilization-train.jsonl') if x['task']=='general'}
train=read(R/'acquisition.jsonl')*4+read(R/'check.jsonl')*2+rename+ban*4+sorting+list(oldgeneral.values())
assert len(train)==464
checks=[];rubric={}
def add(row,criteria=None,group=None):
 checks.append(row)
 if row['task']=='draft':rubric[row['id']]=dict(criteria=criteria,group=group)
for i,(old,new,color,reverse) in enumerate([('Ревизии','Аудиты','голубым',False),('Курсы','Программы','бежевым',True)]):
 for no,co in [(False,True),(True,False),(False,False),(True,True)]:
  nq='Снимаем предложение нового имени?';cq='Изменение цвета остаётся в силе?'
  na=f'Нет, нужно название «{new}».' if no else f'Да, оставляем «{old}».'
  ca=f'Да, делаем значок {color}.' if co else 'Нет, оставляем прежний цвет.'
  pairs=[(nq,na),(cq,ca)]
  if reverse:pairs.reverse()
  turns=[f'Для «{old}» предложены имя «{new}» и значок {color}. Адрес и содержимое сохранить.']
  if i==0:turns+=['Содержимое тоже обновлять?','Нет, сохранить полностью.']
  for q,a in pairs:turns += [q,a]
  turns[-1]+=' Подготовь итоговую задачу.'
  desc=(f'Переименовать «{old}» в «{new}». ' if no else f'Название «{old}» сохранить. ')+(f'Значок сделать {color}. ' if co else 'Цвет значка не менять. ')+'Адрес и содержимое сохранить.'
  add(draft(f'f-rename-{i}-{int(no)}{int(co)}',turns,desc,f'Изменения раздела «{old}»'),[f'Rename active: {no}',f'Color change active: {co}','Address and content preserved'],f'rename-order-{i}')
for allow,reveal in [(False,False),(True,False),(False,True),(True,True)]:
 turns=['Отчёт инвентаризации направлять заведующему, арендатору не направлять. В нём номер описи и итог. Почту ревизора скрывать.','Номер описи заменить номером ведомости?','Да.','Арендатор теперь тоже получает отчёт?','Да, запрет снимаем.' if allow else 'Нет, запрет остаётся.','Почту ревизора можно открыть?','Да, скрывать больше не надо.' if reveal else 'Нет, скрытие сохраняется.','Итог оставить?','Да. Составь задачу.']
 desc='Отправлять заведующему номер ведомости и итог. '+('Также отправлять арендатору. ' if allow else 'Арендатору не отправлять. ')+('Показывать почту ревизора.' if reveal else 'Почту ревизора скрывать.')
 add(draft(f'f-ban-{int(allow)}{int(reveal)}',turns,desc,'Отчёт инвентаризации'),['Manager recipient, statement number and result',f'Tenant receives: {allow}',f'Reviewer email visible: {reveal}'],'recipient-field')
add(draft('f-topic',['Уведомление механику: номер оборудования и дата осмотра. Имя собственника скрывать.','План закупок добавить?','Нет, закупки — другая задача.','Дату заменить временем?','Нет, дату оставить ДД/ММ/ГГГГ.','Имя открыть?','Нет. Оформи только уведомление.'],'Уведомлять механика: номер оборудования и дата осмотра в формате ДД/ММ/ГГГГ. Имя собственника скрывать. План закупок не включать.','Уведомление об осмотре'),['Mechanic/equipment/date with exact format','Hidden owner','No purchasing scope'])
add(draft('f-print',['Печатать наклейку с кодом изделия, датой упаковки и номером смены. Имя упаковщика не печатать.','Добавим поиск изделия?','Нет.','Формат даты?','ДД-ММ-ГГ.','Смену убрать?','Нет, оставить. Подготовь задачу.'],'Печатать код изделия, дату упаковки в формате ДД-ММ-ГГ и номер смены. Имя упаковщика не печатать. Поиск изделия не добавлять.','Печать наклейки'),['Three fields with exact date format','No packer name','No search'])
add(draft('f-notify',['Только при сбое выгрузки сообщать аналитику номер выгрузки и причину.','Имя оператора показать?','Нет.','Номер выгрузки заменить кодом ошибки?','Нет.','При успешной выгрузке тоже сообщать?','Нет. Оформи задачу.'],'Только при сбое выгрузки сообщать аналитику номер выгрузки и причину. Имя оператора скрывать. При успешной выгрузке не сообщать.','Сообщение о сбое выгрузки'),['Analyst, only failure','Export number not error code, cause','Hidden operator'])
add(draft('f-pronoun',['Показывать номер помещения и площадь. Адрес жильца скрывать.','Номер оставляем?','Да.','А его адрес?','По-прежнему скрывать.','Площадь убрать?','Нет. Оформи.'],'Показывать номер помещения и площадь. Адрес жильца скрывать.','Поля помещения'),['Room number and area','Hidden resident address after pronoun follow-up'])
for i,(note,lo,hi,li,ui) in enumerate([
 ('Смещение больше -41 и не больше -23.',-41,-23,False,True),('Смещение не меньше -41 и меньше -23.',-41,-23,True,False),
 ('Время больше 72 и не больше 84 секунд.',72,84,False,True),('Время не меньше 72 и меньше 84 секунд.',72,84,True,False),
 ('Температура строго ниже -67 градусов.',None,-67,None,False),('Температура строго выше -67 градусов.',-67,None,False,None),
 ('Утвердили ровно ноль пропущенных строк.',0,0,True,True),('Ноль пропущенных строк обсуждали, но норму пока не утвердили.',None,None,None,None),
]):add(bounds(f'fn{i}',note,lo,hi,li,ui,['Старое условие больше не действует.','Какое условие записать?'] if i%2 else []))
for id,q,a in [
 ('fg1','Верни только JSON-массив чисел 27, -17, 8 по возрастанию.',[-17,8,27]),
 ('fg2','Верни только JSON-массив чисел 27, -17, 8 по убыванию.',[27,8,-17]),
 ('fg3','Расположи 16, -3, 16, 0 от большего к меньшему. Ответь только JSON-массивом.',[16,16,0,-3]),
 ('fg4','Расположи 16, -3, 16, 0 от меньшего к большему. Ответь только JSON-массивом.',[-3,0,16,16]),
 ('fg5','Ответь только числом: 16 умножить на 15.',240),
 ('fg6','Прочитай value из JSON {"value":73,"ok":true}. Ответь только числом.',73),
 ('fg7','Ответь только числом: len([2, 4, 6, 8]) в Python.',4),
 ('fg8','Ответь только числом: 318 плюс 182.',500),
]:add(example(id,'general',[q],a))
assert len(checks)==32 and len(rubric)==16
prior=[]
for p in R.parent.glob('requirements-draft-*/*.jsonl'):
 if p.name in ['decision-train.jsonl','confirmation.jsonl'] and p.parent==R:continue
 for x in read(p):
  if 'messages' in x and x['messages'][-1]['role']=='assistant':prior.append(x)
assert set(map(sig,checks)).isdisjoint(map(sig,prior+train))
assert len(set(map(sig,checks)))==32
hashes={}
for name,rows in [('decision-train.jsonl',train),('decision-contrasts.jsonl',rename+sorting),('confirmation.jsonl',checks)]:
 p=R/name;p.write_text(''.join(json.dumps(x,ensure_ascii=False)+'\n' for x in rows));hashes[name]=hashlib.sha256(p.read_bytes()).hexdigest()
(R/'confirmation-rubric.json').write_text(json.dumps(rubric,indent=2)+'\n')
(R/'decision-protocol.json').write_text(json.dumps(dict(parent='repaired-adapter',epochs=1,learning_rate=0.00001,layers=5,steps=len(train),hashes=hashes,reason='Repaired v9 retains 30/30 and handles all four recipient/field states, but collapses four rename/color states and sorts one descending case ascending.',selection='Fixed one-pass decision-order/polarity expansion; no new-check selection.',gate='Retain all 30 acquisition targets; numeric/general no worse than parent and base; draft completeness greater than both. Report rename and prohibition groups separately; do not claim reliability unless all group members pass.',limits='New related synthetic families, non-blind semantic review; no automatic release.'),indent=2)+'\n')
print('Prepared',len(train),'decision-training rows and',len(checks),'fresh confirmation cases.')
