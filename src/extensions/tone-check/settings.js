// «Проверка тона», settings: sensitivity and in which send confirmations the check runs (saved with the settings
// form; the channel list lives in one hidden field the checkboxes fill).
(()=>{
 const form=document.getElementById('settings-form');if(!form)return;
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
 const card=el('article',null,'card');card.dataset.extension='tone-check';
 card.append(el('h2','Проверка тона'),el('p','Перед отправкой от вашего имени Петя показывает, что может прозвучать резко, как упрёк, ультиматум или крик, и предлагает мягче. Текст меняется только по вашей кнопке «Заменить», отправить можно как есть. Проверка идёт на этом компьютере; варианты пишет локальная модель.'));
 const level=el('label','Чувствительность');const select=el('select');select.name='toneCheckSensitivity';
 for(const [value,label] of [['low','Низкая — только грубость и ультиматумы'],['medium','Средняя — ещё упрёки, капслок и «!!!»'],['high','Высокая — ещё неясные места и длинные фразы']])select.add(new Option(label,value));
 level.append(select);card.append(level);
 const hidden=el('input');hidden.type='hidden';hidden.name='toneCheckChannels';card.append(hidden);
 const box=el('fieldset',null,'tone-check-channels');box.append(el('legend','Где проверять'));
 const CHANNELS=[['slack','Slack'],['discord','Discord'],['store-reviews','Ответы на отзывы'],['support','Ответы в поддержку'],['mail','Черновики писем'],['github','Комментарии в PR'],['other','Другие приложения']];
 const boxes=CHANNELS.map(([value,label])=>{const l=el('label',null,'check');const c=el('input');c.type='checkbox';c.value=value;c.onchange=()=>{hidden.value=boxes.filter(b=>b.checked).map(b=>b.value).join(',')||'none';};l.append(c,label);box.append(l);return c;});
 card.append(box);
 const sync=()=>{const list=(hidden.value||CHANNELS.map(c=>c[0]).join(',')).split(',');if(!hidden.value)hidden.value=list.join(',');for(const b of boxes)b.checked=list.includes(b.value);};
 document.addEventListener('petya-settings-displayed',sync);sync();
 form.insertBefore(card,form.querySelector(':scope > button'));
})();
