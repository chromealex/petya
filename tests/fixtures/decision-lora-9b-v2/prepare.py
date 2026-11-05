"""Create boundary pairs, membership questions and held-out complete-draft probes."""
import importlib.util
import json
from pathlib import Path
ROOT=Path(__file__).parent
OLD=ROOT.parent/'decision-lora-9b'
spec=importlib.util.spec_from_file_location('data1',OLD/'build_data.py')
data=importlib.util.module_from_spec(spec);spec.loader.exec_module(data)
MEMBER='По заметке ответь, разрешено ли проверяемое значение указанного условия. Верни JSON {"allowed":true или false}; если решение о норме отложено, allowed=null.'
DRAFT='Составь задачу Jira на русском. Верни JSON summary, description, questions. Сохрани все согласованные требования и точные границы. В questions включи только оставшиеся открытые вопросы.'
def make(topics):
 rows=[]
 for topic,target,n,fixed in topics:
  for kind,end,lo,hi,li,ui,allowed in [
   ('max',f'Разрешено не больше {n}.',None,n,None,True,True),
   ('less',f'Допустимо строго меньше {n}.',None,n,None,False,False),
   ('exact',f'Утверждено ровно {n}.',n,n,True,True,True),
   ('more',f'Требуется больше {n}.',n,None,False,None,False),
   ('min',f'Допускается начиная с {n} включительно.',n,None,True,None,True),
   ('open',f'Предложено {n}. Решение примут после испытания.',None,None,None,None,None)]:
   note=fixed+' '+end
   x=data.sample(topic,target,note,lo,hi,li,ui);x.update(task='bounds',kind=kind)
   rows.append(x)
   rows.append(dict(topic=topic,task='membership',kind=kind,messages=[
    {'role':'system','content':MEMBER},{'role':'user','content':target+'\n'+note+f'\nПроверяем значение {n}.'},
    {'role':'assistant','content':json.dumps({'allowed':allowed},ensure_ascii=False)}]))
 return rows
train=make([('load','Число блоков',21,'Маркировка обязательна.'),('tapes','Длина, см',17,'Записываем дату.'),
 ('hooks','Число крючков',28,'На упаковке нужен код.'),('room','Площадь, м²',32,'Нужна подпись инспектора.'),
 ('test','Время проверки, секунд',26,'В журнале указывают стенд.'),('frames','Количество рам',19,'Указать материал.')])
test=make([('honey','Число банок',23,'На каждой этикетке печатать дату сбора.'),
 ('cloth','Длина отреза, см',41,'Указать название ткани.'),
 ('queue','Время ожидания, минут',29,'Сообщать оператору номер очереди.')])
old=[json.loads(s) for s in (OLD/'train.jsonl').read_text().splitlines()]
for r in old:r['task']='bounds'
# Draft probes are frozen before training and never added to the training set.
drafts=[]
for id,n,note,expected in [
 ('bags-max',23,'На этикетке писать дату сбора и номер пасеки. В коробку можно положить до 23 банок включительно.','Keep both label fields and upper-inclusive 23, with no invented minimum.'),
 ('cloth-less',41,'В заявке сохранять название ткани и цвет. Принимать только отрезы короче 41 см.','Keep fabric and color; exclude exactly 41 cm.'),
 ('queue-open',29,'Оператору сообщать номер очереди и окно обслуживания. Предложили ждать 29 минут, но длительность ещё предстоит согласовать.','Keep both queue fields, leave duration open.'),
 ('frames-exact',33,'На упаковке указать артикул и скрыть имя заказчика. В коробке должны быть ровно 33 рамки.','Keep article and hidden name; exactly 33 with no reopened decision.')]:
 drafts.append(dict(topic=id,task='draft',rubric=expected,messages=[{'role':'system','content':DRAFT},{'role':'user','content':note}]))
for name,rows in [('train',old+train),('holdout',test+drafts)]:
 (ROOT/(name+'.jsonl')).write_text(''.join(json.dumps(r,ensure_ascii=False)+'\n' for r in rows))
assert {r['topic'] for r in old+train}.isdisjoint(r['topic'] for r in test+drafts)
