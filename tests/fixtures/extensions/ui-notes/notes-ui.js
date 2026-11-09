// Renderers of «Заметки на полях»: its page in the rail and its two tabs. Each gets (container, api): api.feature
// calls this app's IPC, api.onShow(fn) runs fn whenever the page or tab is shown again (to refresh).
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('notes-ui.css',document.currentScript.src).href;document.head.append(style);
 const k=()=>window.resultKit;
 function list(rows){
  const ul=k().el('ul','notes-list');
  for(const row of rows){const li=k().el('li',row.done?'done':'');const mark=k().el('span','notes-mark');mark.setAttribute('aria-hidden','true');const text=k().el('span','notes-text',row.text);text.dataset.noI18n='';li.append(mark,text);ul.append(li);}
  return ul;
 }
 function progress(rows){
  const done=rows.filter(r=>r.done).length,box=k().el('div','notes-progress'),bar=k().el('span','notes-bar');
  bar.style.width=Math.round(done/Math.max(1,rows.length)*100)+'%';box.append(bar);return box;
 }
 window.renderNotesPage=(container,api)=>{
  const shown=k().el('p','small notes-shown');let times=0;
  const draw=async()=>{
   const rows=await api.feature('list');times++;shown.textContent='Страница открыта: '+times;
   container.querySelector('.notes-card')?.remove();
   const body=k().el('div','notes-body');body.append(progress(rows),list(rows));
   container.prepend(k().card({app:'Заметки на полях',initial:'З',color:'#4f6a5a',status:{label:rows.filter(r=>!r.done).length+' открыто',tone:'progress'},title:'Мои заметки',body,className:'notes-card'}));
  };
  container.append(shown);api.onShow(draw);return draw();
 };
 window.renderNotesTips=(container,api)=>{
  const box=k().el('div','notes-tip');box.append(k().el('strong',null,'Короткие заметки'),k().el('p','small','Записывайте мелочи, которые не тянут на задачу, — они появятся на странице «Заметки».'));
  const open=k().el('button',null,'Открыть заметки');open.type='button';open.onclick=()=>view('ext-notes');box.append(open);container.append(box);
 };
 window.renderNotesTeam=async(container,api)=>{
  const rows=await api.feature('list');
  container.append(k().el('p','small','Заметки, где упоминаются коллеги:'),list(rows.filter(r=>/Олег/.test(r.text))));
 };
})();
