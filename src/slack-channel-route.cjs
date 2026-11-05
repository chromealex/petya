const norm=x=>String(x||'').toLowerCase().replace(/ё/g,'е');
const parts=x=>norm(x).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
const purposes={разработка:['dev','development','разработка'],dev:['dev','development','разработка'],тестирование:['qa','test','testing','тестирование'],qa:['qa','test','testing','тестирование']};
function channelFromURL(url){try{const u=new URL(url);return u.hostname.endsWith('.slack.com')||u.hostname==='app.slack.com'?/^\/archives\/([CG][A-Z0-9]+)/.exec(u.pathname)?.[1]||'':'';}catch{return '';}}
function chooseChannels(channels,{target='',literal=false,topic={}}={}) {
 const candidates=channels.filter(c=>!c.is_archived&&/^[CG][A-Z0-9]+$/.test(c.id));
 if(literal){const exact=candidates.filter(c=>c.id===target||norm(c.name)===norm(target));return exact.length===1?{channels:exact}:{options:exact.length?exact:candidates,reason:'Указанный канал не найден среди доступных.'};}
 const saved=topic.projectChannels||[];
 const roleKey=/^(?:разработка|dev)$/iu.test(target)?'dev':/^(?:тестирование|qa)$/iu.test(target)?'qa':'default';
 if((!target||purposes[norm(target)])&&(saved.length||topic.hasSavedChannels)){
  let bindings=target?saved.filter(c=>c.role===roleKey):saved.filter(c=>c.role==='default');
  if(!bindings.length)bindings=target?saved.filter(c=>c.role==='default'):saved;
  const ids=new Set(bindings.map(c=>c.id)),matched=candidates.filter(c=>ids.has(c.id));
  if(matched.length===1&&ids.size===1)return {channels:matched};
  return {options:matched.length?matched:candidates,reason:matched.length?'У проекта несколько подтверждённых каналов. Уточните назначение.':'Сохранённый канал недоступен или подключение изменилось. Уточните связь проекта.'};
 }
 let possible=candidates;
 const role=purposes[norm(target)];
 if(role)possible=possible.filter(c=>parts(c.name).some(p=>role.includes(p)));
 else if(target)possible=possible.filter(c=>norm(c.name)===norm(target)||c.id===target);
 const scope=topic.jiraProject||topic.reviewScope||'';
 if(scope){
  // Exact project tokens only: BW must never match MW or BWW.
  const projectParts=parts(scope);
  const matched=possible.filter(c=>projectParts.length&&projectParts.every(p=>parts(c.name).includes(p)));
  if(matched.length)possible=matched;
  else if(possible.length)return {options:possible,reason:'Не удалось связать каналы с текущим проектом «'+scope+'».'};
 }
 const threadChannel=channelFromURL(topic.slackSource?.url);
 const fromThread=possible.find(c=>c.id===threadChannel);
 if(fromThread)return {channels:[fromThread]};
 if(possible.length===1)return {channels:possible};
 return {options:possible.length?possible:candidates,reason:possible.length?'Подходят несколько каналов. Уточните проект или канал.':'Не найден канал для этого назначения.'};
}
async function listChannels(request,token='',{target='',pages=50}={}){
 let cursor='';const seen=new Set(),rows=[];
 for(let page=0;page<pages;page++){
  const data=await request('https://slack.com/api/conversations.list?'+new URLSearchParams({types:'public_channel,private_channel',exclude_archived:'true',limit:'200',...(cursor?{cursor}:{})}),{headers:{Authorization:'Bearer '+token}});
  if(!data?.ok||!Array.isArray(data.channels))throw Error('Не удалось прочитать каналы Slack: '+String(data?.error||'неполный ответ'));
  rows.push(...data.channels);
  if(target){const exact=data.channels.find(c=>!c.is_archived&&(c.id===target||c.name===target));if(exact)return [exact];}
  cursor=String(data.response_metadata?.next_cursor||'').trim();
  if(!cursor)return [...new Map(rows.map(c=>[c.id,c])).values()];
  if(seen.has(cursor))throw Error('Slack повторил страницу каналов.');seen.add(cursor);
 }
 const error=Error('Не удалось загрузить весь список. Укажите точное название или вставьте ссылку на канал.');error.code='SLACK_CHANNEL_LOOKUP_REQUIRED';error.channels=[...new Map(rows.map(c=>[c.id,c])).values()];throw error;
}
async function findChannel(request,token,target){
 target=String(target||'').trim().replace(/^#/,'');const id=channelFromURL(target)||(/^[CG][A-Z0-9]+$/.test(target)?target:'');
 if(id){const data=await request('https://slack.com/api/conversations.info?'+new URLSearchParams({channel:id}),{headers:{Authorization:'Bearer '+token}});if(!data?.ok||data.channel?.id!==id)throw Error('Канал недоступен: '+String(data?.error||'неполный ответ'));if(data.channel.is_archived||data.channel.is_im||data.channel.is_mpim||typeof data.channel.name!=='string')throw Error('Канал архивирован или недоступен.');return data.channel;}
 if(!target||target.length>80||/[\s/]/u.test(target))throw Error('Введите точное название канала или ссылку из Slack.');
 const rows=await listChannels(request,token,{target});const found=rows.filter(c=>!c.is_archived&&c.name===target);if(found.length!==1)throw Error('Канал не найден. Проверьте имя или вставьте ссылку из Slack.');return found[0];
}
module.exports={chooseChannels,listChannels,findChannel,purposes};
