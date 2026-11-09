// Reading candidate messages for mail records from the accounts Petya already reads (the «Почта» app, services.mailAccounts), with
// their HTML kept for JSON-LD. Read only; nothing is marked, moved or sent.
// - Gmail (REST v1): users.messages.list with a query (purchases category or receipt / subscription / booking /
//   renewal words, after the last scan), then users.messages.get?format=full.
// - Outlook (Microsoft Graph v1.0): /me/messages filtered by receivedDateTime, newest first, with body and webLink;
//   subjects are matched locally by the same words.
// Each message: {id, account, provider, from, subject, at, text, html, url}.
const html=require('./html.cjs');
const WORDS=['receipt','invoice','order','subscription','renewal','renews','renew','booking','reservation','itinerary','e-ticket','expires','expiration','payment','чек','квитанция','заказ','подписка','продление','продлена','бронирование','бронь','билет','истекает','оплата','списание','платёж'];
const SUBJECT=new RegExp('(?:'+WORDS.join('|')+'|receipt|invoice|подписк|продлен|бронир|авиабилет|посадочн|истека|оплат|списан|чек)','iu');
const MAX=300;

function gmailQuery(days,after){
 const since=after?'after:'+Math.floor(after/1000):'newer_than:'+Math.max(1,Math.min(730,days))+'d';
 return since+' (category:purchases OR subject:('+WORDS.map(w=>/[\s-]/.test(w)?'"'+w+'"':w).join(' OR ')+'))';
}
function walk(part,acc,depth=0){
 if(!part||depth>12)return acc;
 if(!part.filename&&part.body?.data){
  const t=Buffer.from(part.body.data,'base64url').toString('utf8');
  if(part.mimeType==='text/plain')acc.text.push(t.slice(0,200000));
  else if(part.mimeType==='text/html')acc.html.push(t.slice(0,400000));
 }
 for(const child of part.parts||[])walk(child,acc,depth+1);
 return acc;
}
async function gmail(client,account,{days,after,limit=MAX,progress=()=>{}}){
 const token=await client.access();const headers={Authorization:'Bearer '+token};
 const ids=[];let page='';
 do{
  const list=await client.json('https://gmail.googleapis.com/gmail/v1/users/me/messages?'+new URLSearchParams({q:gmailQuery(days,after),maxResults:'100',...page?{pageToken:page}:{}}),{headers});
  for(const m of list.messages||[])if(/^[a-f0-9]+$/i.test(m.id))ids.push(m.id);
  page=list.nextPageToken||'';
 }while(page&&ids.length<limit);
 return {ids:ids.slice(0,limit),async get(id){
  const m=await client.json('https://gmail.googleapis.com/gmail/v1/users/me/messages/'+id+'?format=full',{headers});
  const h=name=>(m.payload?.headers||[]).find(x=>x.name.toLowerCase()===name)?.value||'';
  const parts=walk(m.payload,{text:[],html:[]});
  const body=parts.html.join('\n');
  progress();
  return {id:m.id,account:account.email,provider:'google',from:h('from').slice(0,300),subject:h('subject').slice(0,300),at:Number(m.internalDate)||Date.parse(h('date'))||0,
   text:(parts.text.join('\n')||html.text(body)||m.snippet||'').slice(0,60000),html:body,url:'https://mail.google.com/mail/u/?authuser='+encodeURIComponent(account.email)+'#all/'+m.id};
 }};
}
async function outlook(client,account,{days,after,limit=MAX}){
 const token=await client.access();const headers={Authorization:'Bearer '+token};
 const since=new Date(after||Date.now()-Math.max(1,Math.min(730,days))*86400000).toISOString();
 let url='https://graph.microsoft.com/v1.0/me/messages?'+new URLSearchParams({'$filter':'receivedDateTime ge '+since,'$orderby':'receivedDateTime desc','$top':'50','$select':'id,subject,from,receivedDateTime,body,webLink'});
 const rows=[];let pages=0;
 while(url&&pages<12&&rows.length<limit){
  if(!url.startsWith('https://graph.microsoft.com/'))break;
  const data=await client.json(url,{headers});pages++;
  for(const m of data.value||[])if(SUBJECT.test(String(m.subject||'')))rows.push(m);
  url=data['@odata.nextLink']||'';
 }
 const byId=new Map(rows.slice(0,limit).map(m=>[m.id,m]));
 return {ids:[...byId.keys()],async get(id){
  const m=byId.get(id);const sender=m.from?.emailAddress||{};
  const body=String(m.body?.content||'');const isHtml=String(m.body?.contentType||'').toLowerCase()==='html';
  return {id:m.id,account:account.email,provider:'microsoft',from:(sender.name?'"'+sender.name+'" ':'')+'<'+(sender.address||'')+'>',subject:String(m.subject||'').slice(0,300),
   at:Date.parse(m.receivedDateTime)||0,text:(isHtml?html.text(body):body).slice(0,60000),html:isHtml?body.slice(0,400000):'',url:/^https:\/\/outlook\.(?:office|live|office365)\.com\//.test(m.webLink||'')?m.webLink:''};
 }};
}
// Every connected account: [{key, email, provider, open(options) → {ids, get(id)}}].
function accounts(mailAccounts){
 const out=[];
 for(const [provider,read] of [['google',gmail],['microsoft',outlook]]){
  const manager=mailAccounts?.[provider];if(!manager)continue;
  let list=[];try{list=manager.accounts();}catch{list=[];}
  for(const a of list)out.push({key:provider+':'+a.id,email:a.email||'',provider,open:options=>read(manager.client(a.id),a,options)});
 }
 return out;
}
module.exports={accounts,gmail,outlook,gmailQuery,SUBJECT};
