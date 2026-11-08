// Docs plugin, renderer: Confluence / Notion pages as cards — excerpt around the match, the page's sections,
// open, and a follow-up question about the page. Data: message.extensionData.docItems.
(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('doc-cards.css',document.currentScript.src).href;document.head.append(style);
 const when=v=>{const d=new Date(v);return Number.isFinite(d.getTime())?'обновлено '+window.relativeTime(d):'';};
 function docCard(k,doc){
  const body=k.el('div','doc-body');if(doc.excerpt)body.append(k.el('p','doc-excerpt',doc.excerpt));
  if(doc.sections?.length){const toc=k.el('details','doc-toc');toc.append(k.el('summary',null,'Разделы · '+doc.sections.length));const ol=k.el('ol');for(const s of doc.sections)ol.append(k.el('li',null,s));toc.append(ol);body.append(toc);}
  const notion=doc.source==='Notion';
  return k.card({app:doc.source,initial:notion?'N':'C',color:notion?'#37352f':'#1868db',key:doc.title,href:doc.url,subtitle:when(doc.updated),body,className:'doc-card',
   actions:[{label:'Открыть',primary:true,run:()=>{const url=k.safeUrl(doc.url);if(url)window.open(url,'_blank','noopener');}},
    {label:'Спросить по странице',run:()=>k.ask('По странице «'+doc.title+'» ('+doc.url+'): ')},
    {label:'В задачу',title:'Подготовить задачу в Jira со ссылкой на страницу',run:()=>k.ask('Создай задачу в Jira по странице «'+doc.title+'» '+doc.url+': ')}]});
 }
 window.renderDocItems=(parent,docs)=>{
  const k=window.resultKit;if(!k||!Array.isArray(docs)||!docs.length||parent.querySelector('.doc-list'))return;
  const list=k.el('div','kit-list doc-list');list.append(k.collapse(docs.map(d=>docCard(k,d)),3,'Ещё страницы'));parent.append(list);
 };
})();
