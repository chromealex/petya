"""Generate new Russian requirement-draft dialogues with corrections for Petya Andromeda D2.

Instead of repeating failed familiar cases, every family below describes one kind of correction that the earlier
repairs kept getting wrong (a cancelled item next to a kept one, permissions given, withdrawn and restored per
recipient, an addition that is not a replacement, exact literals, a change limited to one place, a quote that is not
an instruction, an open value that becomes a question, something explicitly left out). Each family has several
phrasings for every turn and draws objects, names and numbers from pools. The held-out pools and phrasings are
disjoint from the training ones, so the held-out set measures the correction, not the memorised words.
"""
import argparse
import json
import random
from pathlib import Path

SYSTEM = ('Составь задачу Jira на русском. Верни JSON summary, description, questions. Сохрани все согласованные '
          'требования и точные границы. В questions включи только оставшиеся открытые вопросы.')

# Documents: nominative, accusative, genitive, gender (m/f/n).
DOCS = {
    'train': [('акт', 'акт', 'акта', 'm'), ('ведомость', 'ведомость', 'ведомости', 'f'), ('отчёт', 'отчёт', 'отчёта', 'm'),
              ('накладная', 'накладную', 'накладной', 'f'), ('справка', 'справку', 'справки', 'f'), ('протокол', 'протокол', 'протокола', 'm'),
              ('смета', 'смету', 'сметы', 'f'), ('памятка', 'памятку', 'памятки', 'f'), ('договор', 'договор', 'договора', 'm'),
              ('квитанция', 'квитанцию', 'квитанции', 'f'), ('спецификация', 'спецификацию', 'спецификации', 'f'), ('табель', 'табель', 'табеля', 'm'),
              ('реестр', 'реестр', 'реестра', 'm'), ('путевой лист', 'путевой лист', 'путевого листа', 'm'), ('заявка', 'заявку', 'заявки', 'f')],
    'hold': [('паспорт изделия', 'паспорт изделия', 'паспорта изделия', 'm'), ('опись', 'опись', 'описи', 'f'), ('регламент', 'регламент', 'регламента', 'm'),
             ('счёт', 'счёт', 'счёта', 'm'), ('анкета', 'анкету', 'анкеты', 'f'), ('чек-лист', 'чек-лист', 'чек-листа', 'm')],
}
# Recipients: nominative, dative, genitive.
ROLES = {
    'train': [('бухгалтер', 'бухгалтеру', 'бухгалтера'), ('кладовщик', 'кладовщику', 'кладовщика'), ('юрист', 'юристу', 'юриста'), ('курьер', 'курьеру', 'курьера'), ('технолог', 'технологу', 'технолога'),
              ('инженер', 'инженеру', 'инженера'), ('аудитор', 'аудитору', 'аудитора'), ('менеджер', 'менеджеру', 'менеджера'), ('логист', 'логисту', 'логиста'), ('кассир', 'кассиру', 'кассира'),
              ('прораб', 'прорабу', 'прораба'), ('снабженец', 'снабженцу', 'снабженца'), ('оператор', 'оператору', 'оператора'), ('заказчик', 'заказчику', 'заказчика')],
    'hold': [('нотариус', 'нотариусу', 'нотариуса'), ('стажёр', 'стажёру', 'стажёра'), ('архивариус', 'архивариусу', 'архивариуса'), ('метролог', 'метрологу', 'метролога'), ('диспетчер смены', 'диспетчеру смены', 'диспетчера смены')],
}
# Screens or tables where a rename happens: «в X» (prepositional) and a short summary noun phrase.
PLACES = {
    'train': [('в форме заказа', 'Поля формы заказа'), ('в таблице поставок', 'Поля таблицы поставок'), ('в карточке клиента', 'Поля карточки клиента'),
              ('в журнале смен', 'Поля журнала смен'), ('в отчёте продаж', 'Поля отчёта продаж'), ('в анкете сотрудника', 'Поля анкеты сотрудника'),
              ('в справочнике товаров', 'Поля справочника товаров'), ('в реестре договоров', 'Поля реестра договоров')],
    'hold': [('в окне склада', 'Поля окна склада'), ('в списке рейсов', 'Поля списка рейсов'), ('в паспорте станка', 'Поля паспорта станка')],
}
IDS = {
    'train': [('order_ref', 'order_code'), ('client_tag', 'customer_tag'), ('ship_date', 'delivery_date'), ('raw_sum', 'net_sum'), ('row_key', 'line_key'),
              ('temp_label', 'final_label'), ('src_code', 'origin_code'), ('mgr_id', 'owner_id'), ('qty_raw', 'qty_total'), ('box_no', 'pack_no'),
              ('city_id', 'town_id'), ('stage_tag', 'phase_tag'), ('lot_num', 'batch_num'), ('note_txt', 'memo_txt'), ('prio_lvl', 'rank_lvl'),
              ('item_sku', 'goods_sku'), ('team_ref', 'group_ref'), ('pay_flag', 'paid_flag')],
    'hold': [('dock_slot', 'bay_slot'), ('crew_code', 'staff_code'), ('tare_kg', 'gross_kg'), ('seal_no', 'stamp_no'), ('gate_id', 'port_id'), ('vat_rate', 'tax_rate')],
}
LABELS = {
    'train': [('Склад', 'Ряд', 'Ячейка'), ('Город', 'Улица', 'Дом'), ('Отдел', 'Сектор', 'Группа'), ('Корпус', 'Этаж', 'Кабинет'), ('Бренд', 'Модель', 'Цвет'),
              ('Цех', 'Линия', 'Станок'), ('Регион', 'Район', 'Участок'), ('Вагон', 'Купе', 'Место'), ('Зал', 'Ряд', 'Кресло'), ('Каталог', 'Раздел', 'Страница')],
    'hold': [('Терминал', 'Сектор', 'Стойка'), ('Фабрика', 'Цех', 'Пост'), ('Рейс', 'Салон', 'Кресло')],
}
LITERALS = {
    'train': [('Ёлка_А-0012', 'ёлка_0012.xlsx'), ('Счёт_Б-0450', 'счёт_0450.pdf'), ('Объём_К-0031', 'объём_0031.csv'), ('Шрифт_Ж-0807', 'шрифт_0807.txt'),
              ('Щит_Э-0099', 'щит_0099.docx'), ('Узел_Ц-0420', 'узел_0420.json'), ('Пульт_Ю-0063', 'пульт_0063.zip'), ('Ящик_Ф-0705', 'ящик_0705.csv')],
    'hold': [('Жёлоб_Ш-0017', 'жёлоб_0017.pdf'), ('Чан_Ы-0208', 'чан_0208.xlsx'), ('Мачта_Я-0901', 'мачта_0901.txt')],
}
QUOTES = {
    'train': ['не пересылай таблицу', 'запретить печать бланка', 'никому не показывай отчёт', 'удали старую версию', 'не открывай доступ клиенту',
              'остановить отгрузку', 'не согласовывай смету', 'заблокировать учётную запись'],
    'hold': ['не выкладывай схему', 'запретить выдачу ключей', 'отмени рассылку'],
}
GOODS = {
    'train': [('набор инструментов', 'набора инструментов'), ('комплект формы', 'комплекта формы'), ('пропуск на парковку', 'пропуска на парковку'),
              ('посылку', 'посылки'), ('ключ от архива', 'ключа от архива'), ('образец ткани', 'образца ткани'), ('пакет документов', 'пакета документов')],
    'hold': [('рацию', 'рации'), ('планшет курьера', 'планшета курьера'), ('ящик с пробами', 'ящика с пробами')],
}
EVENTS = {
    'train': [('перенос совещания', 'переносе совещания'), ('смену графика', 'смене графика'), ('закрытие склада', 'закрытии склада'), ('начало инвентаризации', 'начале инвентаризации'),
              ('отмену поставки', 'отмене поставки'), ('замену поставщика', 'замене поставщика')],
    'hold': [('перенос аудита', 'переносе аудита'), ('ремонт лифта', 'ремонте лифта')],
}
SPLIT_SEED = {'train': 11, 'hold': 97}


def pick(rng, pool, n=1):
    return rng.sample(pool, n) if n > 1 else rng.choice(pool)


def his(gender):
    return {'m': 'его', 'f': 'её', 'n': 'его'}[gender]


def say(rng, options):
    return rng.choice(options)


# Every family returns (turns, target) where turns alternate user/assistant and end with the user.
def cancel_one(rng, part, phr):
    place, summary = pick(rng, PLACES[part])
    (a1, a2), (b1, b2) = pick(rng, IDS[part], 2)
    first = rng.random() < 0.5
    cancelled, kept = ((a1, a2), (b1, b2)) if first else ((b1, b2), (a1, a2))
    which = 'первую' if first else 'вторую'
    turns = [
        say(rng, phr['rename_two']).format(place=place, a1=a1, a2=a2, b1=b1, b2=b2),
        say(rng, ['Обе замены согласованы?', 'Делаем обе?', 'Это окончательный список замен?', 'Обе переименовываем?']),
        say(rng, phr['cancel_one']).format(which=which, c1=cancelled[0], c2=cancelled[1]),
        say(rng, ['Значит, и вторую отменяем?' if first else 'Значит, и первую отменяем?', 'Отменяем обе?', 'Остальное тоже не делаем?']),
        say(rng, ['Нет, {k1} на {k2} остаётся.', 'Нет, замена {k1} в силе.', 'Нет, {k1} переименовываем, как договорились.']).format(k1=kept[0], k2=kept[1]),
        say(rng, ['Что записать?', 'Оформить итог?', 'Подготовить задачу?']),
        say(rng, phr['finish']),
    ]
    parts = ['Сохранить ' + cancelled[0] + ' без замены на ' + cancelled[1] + '.', 'Переименовать ' + kept[0] + ' в ' + kept[1] + '.']
    if not first:
        parts.reverse()
    return turns, {'summary': summary, 'description': ' '.join(parts), 'questions': []}


def permission(rng, part, phr):
    doc = pick(rng, DOCS[part])
    role, role_dat, _ = pick(rng, ROLES[part])
    mode = rng.choice(['revoke', 'restore', 'grant'])
    extra = rng.choice([None, ('дату', 'дата', 'даты', 'f'), ('подпись', 'подпись', 'подписи', 'f'), ('печать', 'печать', 'печати', 'f'), ('номер версии', 'номер версии', 'номера версии', 'm')])
    keep_acc, keep_word = rng.choice([('сумму', 'сумма'), ('адрес', 'адрес'), ('номер заказа', 'номер заказа'), ('список позиций', 'список позиций'), ('телефон', 'телефон')])
    turns = [say(rng, ['Подготовь {doc} с полем «{keep}».', 'Нужно сформировать {doc}, там оставить {acc}.', 'Сделай {doc}: обязательно {acc}.']).format(doc=doc[1], keep=keep_word, acc=keep_acc)]
    if mode == 'revoke':
        turns += [say(rng, ['Отправить {r}?', 'Можно передать {r}?', '{R} пересылать?']).format(r=role_dat, R=role_dat.capitalize()),
                  say(rng, ['Да, разрешаю.', 'Да, можно.', 'Пусть получит.'])]
    elif mode == 'restore':
        turns += [say(rng, ['{R} пересылать?', 'Отправлять {r}?']).format(r=role_dat, R=role_dat.capitalize()),
                  say(rng, ['Нет, {r} нельзя.', 'Пока запрещаю отправку {r}.']).format(r=role_dat)]
    else:
        turns += [say(rng, ['Кому отправить?', 'Передавать кому-нибудь?']), say(rng, ['Пока никому.', 'Пока не решил.'])]
    if extra:
        need = 'нужна' if extra[3] == 'f' else 'нужен'
        turns += [say(rng, ['Добавить {x}?', need.capitalize() + ' {n}?']).format(x=extra[0], n=extra[1]),
                  say(rng, ['Нет, {x} не добавляй.', '{N} не ' + need + '.', 'Без этого.']).format(x=extra[0], N=extra[1].capitalize())]
    if mode == 'revoke':
        turns += [say(rng, ['Отправлять сейчас?', 'Сразу передать?']), say(rng, ['Отменяю разрешение: {r} не отправлять.', 'Передумал, {r} пока не посылать.', 'Нет, разрешение отзываю.']).format(r=role_dat)]
        rule = 'Разрешение отправки ' + role_dat + ' отменено; ' + doc[1] + ' не отправлять.'
    elif mode == 'restore':
        turns += [say(rng, ['Запрет остаётся?', 'Так и не пересылаем?']), say(rng, ['Снимаю запрет: {r} можно отправить.', 'Теперь можно, {r} разрешаю.']).format(r=role_dat)]
        rule = 'Отправка ' + role_dat + ' разрешена; прежний запрет отменён.'
    else:
        turns += [say(rng, ['Решили с получателем?', 'Кому в итоге?']), say(rng, ['Разрешаю отправить {r}.', 'Можно {r}.']).format(r=role_dat)]
        rule = 'Отправка ' + role_dat + ' разрешена.'
    turns += [say(rng, ['Что оформить?', 'Записать задачу?']), say(rng, phr['finish'])]
    head = 'Подготовить ' + doc[1] + ' с полем «' + keep_word + '»' + ('' if not extra else ', без ' + extra[2]) + '.'
    summary = 'Подготовка: ' + doc[0]
    return turns, {'summary': summary, 'description': head + ' ' + rule, 'questions': []}


def two_recipients(rng, part, phr):
    doc = pick(rng, DOCS[part])
    (r1, d1, g1), (r2, d2, g2) = pick(rng, ROLES[part], 2)
    note = rng.random() < 0.6
    turns = [say(rng, ['Подготовь две одинаковые копии: {doc} для {a} и для {b}.', 'Нужны два одинаковых экземпляра: {doc} {a2} и {b2}.']).format(doc=doc[0], a=g1, b=g2, a2=d1, b2=d2),
             say(rng, ['Обоим можно отправить?', 'Передаём обоим?']),
             say(rng, ['{A} можно. {B} пока нельзя.', '{A} разрешаю, {b} запрещаю.']).format(A=d1.capitalize(), B=d2.capitalize(), b=d2),
             say(rng, ['Содержание разное?', 'Копии отличаются?']), say(rng, ['Нет, содержание одинаковое.', 'Нет, текст один.'])]
    if note:
        turns += [say(rng, ['Добавить пояснение?', 'Приложить комментарий?']), say(rng, ['Не добавляй.', 'Без пояснения.'])]
    turns += [say(rng, ['Тогда отменяем и {a}?', 'Значит, {a} тоже нельзя?']).format(a=d1),
              say(rng, ['Нет, {a} можно; запрет только для {g}.', 'Нет, {a} разрешено, нельзя только {b}.']).format(a=d1, b=d2, g=g2), say(rng, phr['finish'])]
    turns.insert(-1, say(rng, ['Что записать?', 'Оформить?']))
    desc = 'Подготовить две одинаковые копии документа «' + doc[0] + '»' + (' без пояснения' if note else '') + '. Отправка ' + d1 + ' разрешена, отправка ' + d2 + ' запрещена.'
    return turns, {'summary': 'Копии для двух получателей', 'description': desc, 'questions': []}


def add_field(rng, part, phr):
    a, b, c = pick(rng, LABELS[part])
    turns = [say(rng, ['В карточке уже есть «{a}» и «{b}».', 'Сейчас там поля «{a}» и «{b}».']).format(a=a, b=b),
             say(rng, ['Нужно новое поле?', 'Что меняем?']), say(rng, ['Добавь «{c}».', 'Нужно ещё «{c}».']).format(c=c),
             say(rng, ['Вместо «{a}»?', 'Это замена «{a}»?']).format(a=a), say(rng, ['Нет, отдельное дополнительное поле.', 'Нет, это новое поле рядом.']),
             say(rng, ['«{b}» убрать?', 'А «{b}» оставить?']).format(b=b), say(rng, ['Оба существующих оставь.', 'Нет, оба остаются.']),
             say(rng, ['Сократить названия?', 'Можно писать коротко?']), say(rng, ['Не сокращай.', 'Названия полностью.']), say(rng, phr['finish'])]
    turns.insert(-1, say(rng, ['Оформляем?', 'Записать?']))
    return turns, {'summary': 'Новое поле «' + c + '»', 'description': 'Сохранить поля «' + a + '» и «' + b + '», добавить отдельное поле «' + c + '». Названия не сокращать.', 'questions': []}


def exact_name(rng, part, phr):
    title, file = pick(rng, LITERALS[part])
    turns = [say(rng, ['Заголовок: «{t}». Файл: {f}.', 'Назови отчёт «{t}», файл {f}.']).format(t=title, f=file),
             say(rng, ['Перевести в латиницу?', 'Писать латинскими буквами?']), say(rng, ['Нет, буквы точно как написано.', 'Нет, написание не менять.']),
             say(rng, ['А нули в начале номера?', 'Нули убрать?']), say(rng, ['Нули тоже сохранить.', 'Оставь нули.']),
             say(rng, ['Запретить переименование остальных файлов?', 'Распространить на все файлы?']), say(rng, ['Нет, речь только об этом заголовке и этом файле.', 'Нет, только эти два названия.']),
             say(rng, ['Записать?', 'Оформить итог?']), say(rng, phr['finish'])]
    return turns, {'summary': 'Название и файл', 'description': 'Использовать заголовок «' + title + '» и имя файла ' + file + ' без изменения букв и начальных нулей.', 'questions': []}


def screen_only(rng, part, phr):
    (old, new) = pick(rng, IDS[part])
    turns = [say(rng, ['На экране переименовать {o} в {n}.', 'В интерфейсе показывать {n} вместо {o}.']).format(o=old, n=new),
             say(rng, ['Данные тоже перенести?', 'В базе менять?']), say(rng, ['Нет, данные не переносить и схему базы не менять.', 'Нет, база остаётся как есть, данные не трогать.']),
             say(rng, ['Показать оба названия?', 'Старое оставить видимым?']), say(rng, ['Только новое, старое скрыть.', 'Старое скрыть.']),
             say(rng, ['Миграция нужна?', 'Скрипт миграции писать?']), say(rng, ['Нет.', 'Не нужно.']), say(rng, ['Что в задаче?', 'Оформить?']), say(rng, phr['finish'])]
    return turns, {'summary': 'Название на экране', 'description': 'На экране показывать ' + new + ' вместо ' + old + ', старое название скрыть. Данные не переносить, схему базы не менять, миграцию не выполнять.', 'questions': []}


def quote(rng, part, phr):
    q = pick(rng, QUOTES[part])
    doc = pick(rng, DOCS[part])
    role, dat, _ = pick(rng, ROLES[part])
    turns = [say(rng, ['В документе «{n}» есть цитата «{q}».', 'В тексте {g} приведена фраза «{q}».']).format(n=doc[0], g=doc[2], q=q),
             say(rng, ['Это запрет для нас?', 'Это наше указание?']), say(rng, ['Нет, это пример фразы в тексте.', 'Нет, просто цитата в документе.']),
             say(rng, ['Удалить её?', 'Убрать цитату?']), say(rng, ['Сохрани её дословно.', 'Оставь как есть, слово в слово.']),
             say(rng, ['{D} можно передать {r}?', 'Передавать {r}?']).format(D=doc[0].capitalize(), r=dat), say(rng, ['Да, разрешаю целиком.', 'Да, можно весь документ.']),
             say(rng, ['Что оформить?', 'Записать?']), say(rng, phr['finish'])]
    return turns, {'summary': doc[0].capitalize() + ' с цитатой', 'description': 'Сохранить дословную цитату «' + q + '» в документе «' + doc[0] + '». Передача документа ' + dat + ' разрешена; цитата не является запретом этой передачи.', 'questions': []}


def open_recipient(rng, part, phr):
    ev, ev_p = pick(rng, EVENTS[part])
    (r1, d1, _), (r2, d2, _) = pick(rng, ROLES[part], 2)
    room = rng.randint(2, 40)
    turns = [say(rng, ['Нужно уведомление о {e}, место — зал {n}.', 'Подготовь уведомление о {e} в зале {n}.']).format(e=ev_p, n=room),
             say(rng, ['Отправить {a}?', 'Отправить {a}?']).format(a=d1), say(rng, ['Получателя пока не выбирали.', 'Адресат ещё не решён.']),
             say(rng, ['Может, {b}?', 'Тогда {b}?']).format(b=d2), say(rng, ['Нет, адресата решим отдельно.', 'Нет, кому — решим позже.']),
             say(rng, ['Зал {n} остаётся?', 'Место прежнее?']).format(n=room), say(rng, ['Да.', 'Да, зал {n}.']).format(n=room),
             say(rng, ['Разослать всем?', 'Отправить всем сразу?']), say(rng, ['Нет, без выбранного получателя никому не отправлять.', 'Нет, пока адресата нет — никому.']), say(rng, phr['finish'])]
    turns.insert(-1, say(rng, ['Оформить?', 'Что записать?']))
    return turns, {'summary': 'Уведомление о ' + ev_p, 'description': 'Подготовить уведомление о ' + ev_p + ' в зале ' + str(room) + '. Получатель пока не выбран; никому не отправлять до его выбора.',
                   'questions': ['Кому направить уведомление о ' + ev_p + '?']}


def code(rng, part, phr):
    good, good_g = pick(rng, GOODS[part])
    sec = rng.choice([90, 120, 135, 180, 240, 275, 300, 347, 420, 515, 600])
    form = 'секунду' if sec % 10 == 1 and sec % 100 != 11 else 'секунды' if 2 <= sec % 10 <= 4 and not 12 <= sec % 100 <= 14 else 'секунд'
    open_duration = rng.random() < 0.35
    turns = [say(rng, ['Одноразовый код нужен, чтобы получить {g}.', 'По одноразовому коду выдают {g}.']).format(g=good)]
    if open_duration:
        turns += [say(rng, ['Срок {s} {f}?', 'Действует {s} {f}?']).format(s=sec, f=form), say(rng, ['Этот срок не согласован.', 'Срок ещё не решили.'])]
    else:
        turns += [say(rng, ['Сколько действует?', 'Какой срок?']), say(rng, ['{s} {f}.', 'Ровно {s} {f}.']).format(s=sec, f=form)]
    turns += [say(rng, ['Для входа тоже?', 'Использовать для авторизации?']), say(rng, ['Нет, вход не связан с кодом.', 'Нет, код не для входа.'])]
    if not open_duration:
        turns += [say(rng, ['Тот же код можно ещё раз?', 'Повторно подходит?']), say(rng, ['После получения он использован, повторно нельзя.', 'Нет, второй раз не сработает.']),
                  say(rng, ['Значит, больше получить нельзя?', 'Других выдач не будет?']), say(rng, ['Нет, следующая выдача — по новому коду.', 'Можно, но по новому коду.'])]
    else:
        turns += [say(rng, ['Какой тогда срок?', 'Что ставить по сроку?']), say(rng, ['Решим позже, сейчас значения нет.', 'Пока без значения.'])]
    turns += [say(rng, ['Составить задачу?', 'Оформить?']), say(rng, phr['finish'])]
    if open_duration:
        return turns, {'summary': 'Код получения ' + good_g, 'description': 'Использовать одноразовый код для получения ' + good_g + ', не для входа. Срок действия пока не определён.',
                       'questions': ['Какой срок действия установить для кода?']}
    return turns, {'summary': 'Код получения ' + good_g, 'description': 'Одноразовый код получения ' + good_g + ' действует ' + str(sec) + ' ' + form + ' и не используется для входа. '
                   'После получения тот же код повторно использовать нельзя. Следующую выдачу выполнять по новому коду.', 'questions': []}


FAMILIES = {'cancel-one': cancel_one, 'permission': permission, 'two-recipients': two_recipients, 'add-field': add_field, 'exact-name': exact_name,
            'screen-only': screen_only, 'quote': quote, 'open-recipient': open_recipient, 'code': code}
PHRASES = {
    'train': {'rename_two': ['{place} заменить {a1} на {a2}, а {b1} на {b2}.',
                             'Переименуем {place}: {a1} в {a2} и {b1} в {b2}.', '{place} меняем {a1} на {a2}, а {b1} на {b2}.'],
              'cancel_one': ['Теперь {which} замену ({c1} на {c2}) не делаем.', 'Отменяю {which}: {c1} оставляем.', '{which} замену снимаю, {c1} без изменений.'],
              'finish': ['Оформи.', 'Составь задачу.', 'Запиши итог.', 'Оформи по этим решениям.', 'Подготовь задачу.']},
    'hold': {'rename_two': ['Нужно {place}: {a1} → {a2}, {b1} → {b2}.', 'Предлагаю {place} поменять названия: {a1} станет {a2}, {b1} станет {b2}.'],
             'cancel_one': ['Стоп, {which} не трогаем: {c1} пусть так и называется.', 'По {which} замене передумали — {c1} остаётся.'],
             'finish': ['Сформулируй задачу.', 'Зафиксируй, что решили.', 'Можно оформлять.']},
}


def build(part, count, offset=0):
    rng = random.Random(SPLIT_SEED[part] + offset)
    rows, names = [], list(FAMILIES)
    for i in range(count):
        family = names[i % len(names)]
        turns, target = FAMILIES[family](rng, part, PHRASES[part])
        messages = [{'role': 'system', 'content': SYSTEM}]
        for k, text in enumerate(turns):
            messages.append({'role': 'user' if k % 2 == 0 else 'assistant', 'content': text[:1].upper() + text[1:]})
        assert messages[-1]['role'] == 'user', family
        messages.append({'role': 'assistant', 'content': json.dumps(target, ensure_ascii=False)})
        rows.append({'id': 'd2-' + part + '-' + family + '-' + str(i), 'task': 'draft', 'family': family, 'source': 'd2-generator', 'messages': messages})
    return rows


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--train', type=int, default=720)
    parser.add_argument('--hold', type=int, default=54)
    parser.add_argument('--out', type=Path, default=Path(__file__).resolve().parent)
    a = parser.parse_args()
    for name, rows in [('new-train.jsonl', build('train', a.train)), ('holdout.jsonl', build('hold', a.hold))]:
        sig = {json.dumps(r['messages'][:-1], ensure_ascii=False) for r in rows}
        (a.out / name).write_text(''.join(json.dumps(r, ensure_ascii=False) + '\n' for r in rows))
        print(name, len(rows), 'unique prompts', len(sig))
