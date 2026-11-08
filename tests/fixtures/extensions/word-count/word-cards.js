// «Счётчик слов», renderer: totals and the most frequent words as horizontal bars. Built only with
// window.resultKit; every word comes from the user's text, so it is plain text marked data-no-i18n.
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('word-cards.css',document.currentScript.src).href;document.head.append(style);
 window.renderWordCard=(parent,data)=>{
  const k=window.resultKit;if(!k||!data||parent.querySelector('.word-card'))return;
  const body=k.el('div','word-body');
  const totals=k.el('p','word-totals');totals.append(k.el('strong',null,data.total.toLocaleString(window.petyaLocale||'ru-RU')),k.el('span',null,' слов, разных — '),k.el('strong',null,data.unique.toLocaleString(window.petyaLocale||'ru-RU')));
  body.append(totals);
  const max=Math.max(1,...data.top.map(r=>r.count));
  const list=k.el('ul','word-bars');
  for(const row of data.top){
   const li=k.el('li'),word=k.el('span','word-name',row.word);word.dataset.noI18n='';
   const track=k.el('span','word-track'),bar=k.el('span','word-bar');bar.style.width=Math.round(row.count/max*100)+'%';track.append(bar);
   li.append(word,track,k.el('span','word-count',String(row.count)));li.setAttribute('aria-label',row.word+': '+row.count);
   list.append(li);
  }
  body.append(list);
  parent.append(k.card({app:'Счётчик слов',initial:'С',color:'#5a6f4a',status:{label:'готово',tone:'done'},body,
   actions:[{label:'Посчитать другой текст',run:()=>k.ask('Посчитай слова: ')}],className:'word-card'}));
 };
})();
