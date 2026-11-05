(()=>{
 const descriptions={unity:'Поиск и просмотр префабов открытого проекта',telegram:'Сообщения и обсуждения команды',slack:'Каналы, сообщения и треды',notion:'Страницы и базы знаний',asana:'Поручения и задачи',jira:'Задачи, версии и отчёты',confluence:'Документы и пространства',ai:'Передача задач агентам',googleplay:'Ошибки и ANR приложений',gmail:'Почта и календарь',web:'Поиск по открытым источникам'};
 const glyph={telegram:'➤',asana:'∴',ai:'✧',googleplay:'▷',gmail:'@',web:'◎'};
 window.openAppCatalog=function(term=''){
  const previous=document.activeElement,d=document.createElement('dialog');d.className='app-catalog';
  const make=(tag,text)=>Object.assign(document.createElement(tag),{textContent:text||''});
  const head=make('header'),title=make('h2','Каталог приложений'),close=make('button','×'),search=make('input'),rows=make('div');
  close.type='button';close.setAttribute('aria-label','Закрыть каталог');close.onclick=()=>d.close();
  head.append(title,close);search.type='search';search.placeholder='Найти приложение';search.setAttribute('aria-label',search.placeholder);search.value=term;
  function draw(){
    rows.replaceChildren();const q=search.value.trim().toLocaleLowerCase();
    for(const [id,name] of optionalModules){
      if(!(name+' '+descriptions[id]).toLocaleLowerCase().includes(q))continue;
      const row=make('div'),icon=glyph[id]?make('span',glyph[id]):make('img'),copy=make('div'),enabled=moduleEnabled(id),action=make('button',enabled?'Настроить':'Включить');
      row.className='app-catalog-row';icon.className='app-catalog-icon';
      if(icon.tagName==='IMG'){icon.src=id==='unity'?'../extensions/unity/icon.svg':'catalog-icons/'+id+'.svg';icon.alt='';}
      else icon.setAttribute('aria-hidden','true');
      copy.append(make('strong',name),make('small',descriptions[id]));action.type='button';
      action.onclick=async()=>{action.disabled=true;try{
        if(!enabled){const check=moduleChecks.get(id);check.checked=true;await check.onchange();if(!moduleEnabled(id))return;}
        d.close();view('settings');const card=$('settings').querySelector('[data-service="'+id+'"]');if(card)window.revealSettings(card);
      }finally{action.disabled=false;}};
      row.append(icon,copy,action);rows.append(row);
    }
    if(!rows.children.length)rows.append(make('p','Приложение не найдено.'));
  }
  search.oninput=draw;d.append(head,search,rows);document.body.append(d);draw();d.showModal();search.focus();
  d.onclose=()=>{d.remove();if(document.activeElement===document.body)previous?.focus();};
 };
})();
