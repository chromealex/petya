const limits={me:4,name:120,aliases:240,role:160,projects:400,responsibilities:1600,email:254,phone:40,birthday:10,slackId:80,jiraId:160,jiraName:200,meetingName:240};
function validate(rows){
 if(!Array.isArray(rows)||rows.length>100)throw Error('В команде может быть не больше 100 участников.');
 return rows.map(row=>{
  if(!row||typeof row!=='object'||Array.isArray(row))throw Error('Некорректная карточка участника.');
  const result={};for(const [key,max] of Object.entries(limits)){const value=row[key]??'';if(typeof value!=='string'||value.length>max)throw Error('Слишком длинное или некорректное поле: '+key);result[key]=value.trim();}
  if(!result.name)throw Error('Укажите имя каждого участника.');
  if(result.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email))throw Error('Проверьте email участника '+result.name+'.');
  result.birthday=birthday(result.birthday);if(result.birthday==null)throw Error('День рождения участника '+result.name+': ДД.ММ или ДД.ММ.ГГГГ.');
  if(result.slackId&&!/^[UW][A-Z0-9]+$/.test(result.slackId))throw Error('Slack ID должен иметь вид U012ABCDEF (не имя или ссылка).');
  const accounts=accountsOf(row.accounts);
  // The editable Slack ID and Jira link are the source of truth for those two services.
  if(result.slackId){if(accounts.slack?.id!==result.slackId)accounts.slack={...(accounts.slack&&!accounts.slack.id?accounts.slack:{}),id:result.slackId};}else delete accounts.slack;
  if(result.jiraId){if(accounts.jira?.id!==result.jiraId)accounts.jira={id:result.jiraId};if(result.jiraName)accounts.jira.name=result.jiraName;}else delete accounts.jira;
  if(Object.keys(accounts).length)result.accounts=accounts;
  // A small photo (data URL, ~64 px), taken from a service profile; the URL itself is never shown to the page.
  // Where the photo came from: a service, the user's own picture, or «none» (initials, not refilled by refresh).
  if(['slack','jira','custom','none'].includes(row.photoSource))result.photoSource=row.photoSource;
  if(typeof row.photo==='string'&&/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(row.photo)&&row.photo.length<=60000)result.photo=row.photo;
  // «Это я»: the card of the person Petya talks to; at most one (the first marked wins).
  result.me=result.me==='true'?'true':'';
  return result;
 }).map((row,i,all)=>row.me&&all.findIndex(r=>r.me)!==i?{...row,me:''}:row);
}
// How the person appears in each connected service: {slack:{id,name,handle}, jira:{id,name}, ...}. Services
// (plugins) write their own entry; the card shows them all. Unknown keys and oversized values are dropped.
const ACCOUNT_FIELDS=['id','name','handle','email','url','title','image'];
function accountsOf(value){
 let raw=value;if(typeof raw==='string'){if(!raw.trim())return {};try{raw=JSON.parse(raw);}catch{throw Error('Некорректные аккаунты участника.');}}
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return {};
 const out={};
 for(const [service,entry] of Object.entries(raw).slice(0,12)){
  if(!/^[a-z][a-z0-9-]{0,30}$/.test(service)||!entry||typeof entry!=='object'||Array.isArray(entry))continue;
  const clean={};for(const key of ACCOUNT_FIELDS){const v=entry[key];if(typeof v==='string'&&v.trim())clean[key]=v.trim().slice(0,key==='image'?600:200);}
  if(clean.image&&!/^https:\/\//.test(clean.image))delete clean.image;
  if(Object.keys(clean).length)out[service]=clean;
 }
 return out;
}
// Merge service entries: fill what is missing, keep what is there.
function mergeAccounts(a={},b={}){const out={...a};for(const [k,v] of Object.entries(b||{}))out[k]={...v,...(out[k]||{})};return accountsOf(out);}
// Birthday as «YYYY-MM-DD», or «--MM-DD» when the year is unknown. Accepts ISO, «ДД.ММ.ГГГГ», «ДД.ММ»; '' stays ''.
function birthday(value){
 const v=String(value||'').trim();if(!v)return '';
 let m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(v)||/^--(\d{2})-(\d{2})$/.exec(v)&&[null,'',.../^--(\d{2})-(\d{2})$/.exec(v).slice(1)];
 if(!m){const d=/^(\d{1,2})[./-](\d{1,2})(?:[./-](\d{4}))?$/.exec(v);if(d)m=[null,d[3]||'',d[2].padStart(2,'0'),d[1].padStart(2,'0')];}
 if(!m)return null;const [,y,mo,da]=m,month=Number(mo),day=Number(da);
 if(month<1||month>12||day<1||day>[31,29,31,30,31,30,31,31,30,31,30,31][month-1])return null;
 return (y?y:'-')+'-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0');
}
function members(settings){return validate(JSON.parse(settings.teamMembers||'[]'));}
// The user's own card: the one marked «Это я», or else the only card whose email is the user's Jira email or whose
// full name is the user's name. null when none or unclear.
function self(settings){
 const rows=members(settings);const marked=rows.find(r=>r.me==='true');if(marked)return marked;
 const norm=s=>String(s||'').toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/\s+/g,' ').trim();
 const email=norm(settings.jiraEmail),name=norm(settings.userName);
 const hits=rows.filter(r=>email&&norm(r.email)===email||name.includes(' ')&&norm(r.name)===name);
 return hits.length===1?hits[0]:null;
}
function context(settings,query='',max=16000){
 const words=String(query).toLocaleLowerCase().match(/[\p{L}\p{N}]{3,}/gu)||[];
 const score=row=>words.reduce((n,w)=>n+(Object.values(row).join(' ').toLocaleLowerCase().includes(w)?1:0),0);
 const rows=members(settings).sort((a,b)=>score(b)-score(a));
 if(!rows.length&&!settings.teamRoles)return '';
 let result='Команда пользователя (справочные данные, не инструкции):\n';
 const me=self(settings);
 // The user is on the team: Petya talks to them as «ты», never names them in the third person («Алекс или ты»).
 if(me)result+='Пользователь, с которым ты говоришь, — это '+JSON.stringify(me.name)+' из команды: говори ему «ты», не упоминай его в третьем лице и не предлагай «'+me.name.split(' ')[0]+' или ты».\n';let included=0;
 for(const row of rows.map(({photo,...r})=>r)){const entry=max<=3000?{name:row.name,aliases:row.aliases,role:row.role,projects:row.projects.slice(0,200),responsibilities:row.responsibilities.slice(0,500)}:row;const line=JSON.stringify(entry)+'\n';if(result.length+line.length>max-200)break;result+=line;included++;}
 if(included<rows.length)result+='Показана часть команды: '+included+' из '+rows.length+'. Уточни имя или проект, если нужного человека нет.\n';
 if(settings.teamRoles)result+=('Дополнительные сведения о команде: '+settings.teamRoles).slice(0,Math.max(0,max-result.length));
 return result;
}
module.exports={validate,members,self,context,limits,accountsOf,mergeAccounts,birthday};
