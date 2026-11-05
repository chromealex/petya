"""Build supervised numeric-decision records and a separately authored holdout."""
import json
from pathlib import Path

ROOT = Path(__file__).parent
SYSTEM = ('Из заметки выдели действующую числовую норму указанного условия. Верни только JSON с полями '
          'status (open или final), lower, upper (числа либо null), lowerInclusive, upperInclusive '
          '(true или false при наличии соответствующей границы, иначе null). Для точного значения обе границы '
          'равны и включены. Если норму отложили, обе границы null. Сохраняй только явно установленные границы.')

def sample(topic, target, note, lower, upper, li=None, ui=None):
    answer = dict(status='open' if lower is None and upper is None else 'final', lower=lower,
                  upper=upper, lowerInclusive=li, upperInclusive=ui)
    return {'topic': topic, 'messages': [{'role': 'system', 'content': SYSTEM},
            {'role': 'user', 'content': target + '\n' + note},
            {'role': 'assistant', 'content': json.dumps(answer, ensure_ascii=False, separators=(',', ':'))}]}

def train_rows():
    topics = [
        ('archive','Хранение, суток','Для архива подтвердили две резервные копии.',12,8),
        ('visits','Посетители в группе, человек','Для регистрации нужен телефон.',10,6),
        ('labels','Этикетки на листе, штук','На этикетке указывают номер партии.',8,5),
        ('trays','Масса подноса, кг','На подносе печатают номер секции.',16,9),
        ('reminder','Интервал повторов, минут','Оповещение получает диспетчер.',30,20),
        ('shelves','Ящики на полке, штук','Отметку о полке ставят в накладной.',7,4),
        ('payment','Ожидание ответа, секунд','Предусмотрено два канала уведомления.',45,12),
        ('path','Длина трассы, км','Трассу обозначают синим цветом.',18,11)]
    rows = []
    for i,(topic,target,fixed,p,v) in enumerate(topics):
        common = f'{fixed} В черновике указали {p}. '
        variants = [
            (['Решение примет комиссия после испытаний.', 'Макет принят, число пока предстоит выбрать.'][i%2],None,None,None,None),
            (f'Вместо этого допустимо максимум {v} включительно.',None,v,None,True),
            (f'Окончательно выбрали строго меньше {v}.',None,v,None,False),
            (f'Подтвердили минимум {v} включительно.',v,None,True,None),
            (f'Значение должно превышать {v}.',v,None,False,None),
            (f'Утверждено ровно {v}.',v,v,True,True),
            (f'Приняли значение из черновика как точное.',p,p,True,True),
            (f'Разрешили значения от {v} до {p} включительно.',v,p,True,True)]
        rows.extend(sample(topic,target,common+end,lo,hi,li,ui) for end,lo,hi,li,ui in variants)
    return rows

def test_rows():
    topics = [
      ('sail','Число парусов на лодке','Шкипер предложил 13 парусов. Номер лодки обязателен.',[
       ('Сколько парусов брать, решат перед стартом.',None,None,None,None),
       ('На гонку допускаются лодки с числом парусов не более 9.',None,9,None,True),
       ('По решению жюри на каждой лодке должно быть именно 9 парусов.',9,9,True,True),
       ('Жюри допускает лодки, если парусов меньше 13.',None,13,None,False)]),
      ('kilometers','Пробег до осмотра, км','Для журнала согласованы две подписи. В примере пробег был 70 км.',[
       ('Пример оставили для иллюстрации, норматив появится после обкатки.',None,None,None,None),
       ('Механик назначил осмотр при пробеге свыше 55 км.',55,None,False,None),
       ('Порог входа в график осмотров — от 55 км включительно.',55,None,True,None),
       ('В журнал внесли интервал от 55 до 70 км, оба края входят.',55,70,True,True)]),
      ('bags','Количество пакетов на отправку','На тесте укладывали 24 пакета. Опись обязательна.',[
       ('Упаковщик вернётся с расчётом, тогда выберем число.',None,None,None,None),
       ('Установили верхний предел в двадцать пакетов.',None,20,None,True),
       ('Согласовали ровно двадцать пакетов в отправке.',20,20,True,True),
       ('Регламент требует более двадцати пакетов.',20,None,False,None)]),
      ('break','Длительность перерыва, минут','Руководитель предложил 35 минут. Начало объявляют по громкой связи.',[
       ('С объявлением договорились. Продолжительность обсудят завтра.',None,None,None,None),
       ('Комиссия взяла предложенную длительность без отклонений.',35,35,True,True),
       ('После обсуждения окно сделали длиннее 15, но не дольше 35 минут.',15,35,False,True),
       ('Комиссия гарантировала перерыв продолжительностью не меньше 25 минут.',25,None,True,None)])]
    return [sample(id,target,common+' '+end,lo,hi,li,ui) for id,target,common,variants in topics for end,lo,hi,li,ui in variants]

if __name__ == '__main__':
    train,test=train_rows(),test_rows()
    assert len(train)==64 and len(test)==16
    assert {r['topic'] for r in train}.isdisjoint(r['topic'] for r in test)
    for phase,rows in [('train',train),('holdout',test)]:
        (ROOT/(phase+'.jsonl')).write_text(''.join(json.dumps(r,ensure_ascii=False)+'\n' for r in rows))
