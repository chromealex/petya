#!/usr/bin/env node
// Posts a Petya release to the team channels: Slack #jw-petya and Telegram @aipetya.
//   node scripts/announce.cjs app <version>      — an app release: docs/announcements/<version>.md (Russian; else the
//                                                  «## <version>» section of docs/HISTORY.md) and its screenshots (docs/screenshots/<version>/*.png), with the download link
//   node scripts/announce.cjs model <tag>        — a model release (andromeda-dN): the GitHub release notes, separately
//   add --dry-run to print what would be posted
// Environment: SLACK_BOT_TOKEN (chat:write, files:write; the bot is in the channel), SLACK_CHANNEL (default jw-petya),
// TELEGRAM_BOT_TOKEN (the bot is an admin of the channel), TELEGRAM_CHAT (default @aipetya), GITHUB_REPOSITORY,
// GH_TOKEN (to read a model release). A channel without its token is skipped and said so.
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const [kind,id]=process.argv.slice(2).filter(a=>!a.startsWith('--'));
const dry=process.argv.includes('--dry-run');
const repo=process.env.GITHUB_REPOSITORY||'chromealex/petya';
const MAX_SHOTS=6;

// The section of docs/HISTORY.md for one version, without its heading: {title, body}.
function history(version){
 const lines=fs.readFileSync(path.join(root,'docs/HISTORY.md'),'utf8').split('\n');
 const start=lines.findIndex(l=>l.startsWith('## '+version+' '));
 if(start<0)throw Error('docs/HISTORY.md has no «## '+version+' — …» section.');
 const end=lines.findIndex((l,i)=>i>start&&l.startsWith('## '));
 const title=lines[start].replace(/^##\s+/,'').replace(/^[\d.]+\s+—\s+/,'');
 return {title,body:lines.slice(start+1,end<0?undefined:end).join('\n').trim()};
}
// Markdown of HISTORY/release notes → Slack mrkdwn and Telegram HTML.
const slackText=md=>md.replace(/\*\*(.+?)\*\*/g,'*$1*').replace(/\[([^\]]+)\]\(([^)]+)\)/g,'<$2|$1>').replace(/^- /gm,'• ');
const escape=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const telegramText=md=>escape(md).replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').replace(/`([^`]+)`/g,'<code>$1</code>').replace(/\[([^\]]+)\]\(([^)]+)\)/g,'<a href="$2">$1</a>').replace(/^- /gm,'• ');

// The post for the channels is in Russian, like Petya: docs/announcements/<version>.md («# Заголовок» and the text);
// without it, the HISTORY section.
function announcement(version){
 const file=path.join(root,'docs/announcements',version+'.md');
 if(!fs.existsSync(file))return history(version);
 const text=fs.readFileSync(file,'utf8').trim(),m=/^#\s+(.+)\n+([\s\S]*)$/.exec(text);
 return m?{title:m[1].trim(),body:m[2].trim()}:{title:'',body:text};
}
async function appPost(version){
 const {title,body}=announcement(version);
 const dir=path.join(root,'docs/screenshots',version);
 const shots=fs.existsSync(dir)?fs.readdirSync(dir).filter(f=>/\.(png|jpe?g)$/i.test(f)).sort().slice(0,MAX_SHOTS).map(f=>path.join(dir,f)):[];
 const url='https://github.com/'+repo+'/releases/tag/v'+version;
 return {heading:'Петя '+version+(title?' — '+title:''),body,shots,link:{text:'Скачать для Windows',url}};
}
async function modelPost(tag){
 const headers={Accept:'application/vnd.github+json','User-Agent':'petya-announce',...process.env.GH_TOKEN?{Authorization:'Bearer '+process.env.GH_TOKEN}:{}};
 const r=await fetch('https://api.github.com/repos/'+repo+'/releases/tags/'+encodeURIComponent(tag),{headers});
 if(!r.ok)throw Error('GitHub release '+tag+': HTTP '+r.status);
 const rel=await r.json();
 const [first,...rest]=String(rel.body||'').trim().split('\n\n');
 return {heading:'Обучение модели · '+(rel.name||tag),body:[first,...rest].join('\n\n').trim().slice(0,3500),shots:[],link:{text:'Модель и заметки',url:rel.html_url}};
}

async function slack(post){
 const token=process.env.SLACK_BOT_TOKEN,channel=process.env.SLACK_CHANNEL||'jw-petya';
 if(!token)return 'Slack: пропущено (нет SLACK_BOT_TOKEN)';
 const api=async(method,body,json=true)=>{const r=await fetch('https://slack.com/api/'+method,{method:'POST',headers:{Authorization:'Bearer '+token,...json?{'Content-Type':'application/json; charset=utf-8'}:{}},body:json?JSON.stringify(body):body});const v=await r.json();if(!v.ok)throw Error('Slack '+method+': '+v.error);return v;};
 // The channel id from its name (the bot must be a member).
 let id=channel.replace(/^#/,'');
 if(!/^[CG][A-Z0-9]+$/.test(id)){let cursor='',found='';
  do{const v=await fetch('https://slack.com/api/conversations.list?'+new URLSearchParams({types:'public_channel,private_channel',limit:'1000',exclude_archived:'true',...cursor?{cursor}:{}}),{headers:{Authorization:'Bearer '+token}}).then(r=>r.json());
   if(!v.ok)throw Error('Slack conversations.list: '+v.error);
   found=(v.channels||[]).find(c=>c.name===id)?.id||'';cursor=found?'':v.response_metadata?.next_cursor||'';}while(cursor);
  id=found;}
 if(!/^[CG][A-Z0-9]+$/.test(id))throw Error('Slack: канал '+channel+' не найден или бот не добавлен в него');
 const text='*'+post.heading+'*\n\n'+slackText(post.body)+'\n\n<'+post.link.url+'|'+post.link.text+'>';
 const message=await api('chat.postMessage',{channel:id,text,unfurl_links:false,unfurl_media:false});
 // Screenshots in the thread of the post: files.getUploadURLExternal → upload → files.completeUploadExternal.
 if(post.shots.length){
  const files=[];
  for(const file of post.shots){const bytes=fs.readFileSync(file);
   const up=await fetch('https://slack.com/api/files.getUploadURLExternal?'+new URLSearchParams({filename:path.basename(file),length:String(bytes.length)}),{headers:{Authorization:'Bearer '+token}}).then(r=>r.json());
   if(!up.ok)throw Error('Slack files.getUploadURLExternal: '+up.error);
   const sent=await fetch(up.upload_url,{method:'POST',body:bytes});if(!sent.ok)throw Error('Slack upload: HTTP '+sent.status);
   files.push({id:up.file_id,title:path.basename(file,path.extname(file))});}
  await api('files.completeUploadExternal',{files,channel_id:id,thread_ts:message.ts});
 }
 return 'Slack: опубликовано в #'+channel.replace(/^#/,'')+(post.shots.length?' со скриншотами ('+post.shots.length+')':'');
}
async function telegram(post){
 const token=process.env.TELEGRAM_BOT_TOKEN,chat=process.env.TELEGRAM_CHAT||'@aipetya';
 if(!token)return 'Telegram: пропущено (нет TELEGRAM_BOT_TOKEN)';
 const api=async(method,body)=>{const r=await fetch('https://api.telegram.org/bot'+token+'/'+method,{method:'POST',body});const v=await r.json();if(!v.ok)throw Error('Telegram '+method+': '+v.description);return v;};
 const text='<b>'+escape(post.heading)+'</b>\n\n'+telegramText(post.body)+'\n\n<a href="'+post.link.url+'">'+escape(post.link.text)+'</a>';
 const form=f=>{const d=new FormData();for(const [k,v] of Object.entries(f))d.append(k,v);return d;};
 await api('sendMessage',form({chat_id:chat,text:text.slice(0,4096),parse_mode:'HTML',disable_web_page_preview:'true'}));
 // Screenshots right after the post: one photo, or an album of up to six.
 if(post.shots.length){const d=new FormData();d.append('chat_id',chat);const blob=f=>new Blob([fs.readFileSync(f)],{type:/\.png$/i.test(f)?'image/png':'image/jpeg'});
  if(post.shots.length===1){d.append('photo',blob(post.shots[0]),path.basename(post.shots[0]));await api('sendPhoto',d);}
  else{d.append('media',JSON.stringify(post.shots.map((f,i)=>({type:'photo',media:'attach://p'+i}))));post.shots.forEach((f,i)=>d.append('p'+i,blob(f),path.basename(f)));await api('sendMediaGroup',d);}}
 return 'Telegram: опубликовано в '+chat+(post.shots.length?' со скриншотами ('+post.shots.length+')':'');
}

(async()=>{
 if(!['app','model'].includes(kind)||!id){console.error('Usage: node scripts/announce.cjs app <version> | model <tag> [--dry-run]');process.exit(2);}
 const post=kind==='app'?await appPost(id.replace(/^v/,'')):await modelPost(id);
 if(dry){console.log(JSON.stringify({...post,shots:post.shots.map(f=>path.relative(root,f))},null,1));return;}
 const results=[];let failed=false;
 for(const send of [slack,telegram]){try{results.push(await send(post));}catch(e){failed=true;results.push(e.message);}}
 console.log(results.join('\n'));if(failed)process.exit(1);
})().catch(e=>{console.error(e.message);process.exit(1);});
