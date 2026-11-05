(()=>{
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('issue-cards.css',document.currentScript.src).href;document.head.append(style);
 window.renderJiraIssues=(parent,items)=>{
  if(!Array.isArray(items)||!items.length||parent.querySelector('.jira-issue-list'))return;
  const list=document.createElement('div');list.className='jira-issue-list';
  const keys=new Set(items.map(i=>i.key));
  // Replace only exact issue-list lines; keep the report's explanation and totals.
  for(const node of parent.querySelectorAll(':scope>p,:scope>ul>li,:scope>ol>li'))if(keys.has(node.textContent.match(/^([A-Z][A-Z0-9_]*-\d+)\s+[—–-]/)?.[1]))node.remove();
  let more;
  items.forEach((item,index)=>{
   const card=document.createElement('section');card.className='jira-issue-card';const header=document.createElement('header'),title=document.createElement('h4'),key=document.createElement('a');
   key.textContent=item.key;try{const site=new URL(item.site);if(site.protocol==='https:'||site.protocol==='http:'){key.href=site.origin+'/browse/'+encodeURIComponent(item.key);key.target='_blank';key.rel='noopener';}}catch{}
   header.append(key);if(item.status){const status=document.createElement('span');status.className='jira-issue-status';status.dataset.category=item.category||'';status.textContent=item.status;header.append(status);}
   title.textContent=item.summary;card.append(header,title);
   const fields=[item.type,item.assignee?'Исполнитель: '+item.assignee:'',item.priority?'Приоритет: '+item.priority:''].filter(Boolean);
   if(fields.length){const meta=document.createElement('small');meta.textContent=fields.join(' · ');card.append(meta);}
   if(index<5)list.append(card);else{if(!more){more=document.createElement('details');const summary=document.createElement('summary');summary.textContent='Показать ещё · '+(items.length-5);more.append(summary);list.append(more);}more.append(card);}
  });parent.append(list);
 };
})();
