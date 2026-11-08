// «Разбор плейтеста»: frustration moments from evidence only. Inputs: sampled frames (pixel change from the previous
// sample, a 64-bit average hash, and the vision model's label when one ran), negative phrases from the transcript, and
// the game's event log. Every moment carries its evidence and a timestamp; nothing is added without evidence.
const SEV=['low','medium','high'];
const up=s=>SEV[Math.min(2,SEV.indexOf(s)+1)];
const IDLE_DIFF=0.012,IDLE_MIN=20;
function hamming(a,b){
 if(!a||!b||a.length!==b.length)return 64;
 let d=0;for(let i=0;i<a.length;i++){let x=parseInt(a[i],16)^parseInt(b[i],16);while(x){d+=x&1;x>>=1;}}return d;
}
const clock=t=>{t=Math.max(0,Math.round(t));const h=Math.floor(t/3600),m=Math.floor(t%3600/60),s=t%60;return (h?h+':'+String(m).padStart(2,'0'):m)+':'+String(s).padStart(2,'0');};
const plural=(n,[one,few,many])=>{const a=Math.abs(n)%100,b=a%10;return a>10&&a<20?many:b===1?one:b>=2&&b<=4?few:many;};

function detect({duration=0,frames=[],speech=[],events=[],interval=5}){
 const out=[];
 const add=m=>{out.push({severity:'low',evidence:[],...m});return out.at(-1);};
 const labelText=f=>f?.label?[f.label.description,f.label.text?'на экране: «'+f.label.text+'»':''].filter(Boolean).join('; '):'';

 // Deaths: log events first, fail screens seen in frames are attached to a nearby logged death or stand alone.
 const deaths=[];
 for(const e of events.filter(e=>e.kind==='death'))deaths.push(add({t:e.t,type:'death',title:'Смерть / провал'+(e.level?' · '+e.level:''),level:e.level,
  evidence:[{kind:'event',t:e.t,text:e.type+(e.level?' · '+e.level:'')+(e.detail?' · '+e.detail:'')}]}));
 const failRuns=[];
 frames.forEach((f,i)=>{if(f.label?.screen!=='fail')return;const last=failRuns.at(-1);if(last&&last.end===i-1){last.end=i;}else failRuns.push({start:i,end:i});});
 for(const run of failRuns){
  const f=frames[run.start],next=frames.slice(run.end+1).find(x=>x.label?.screen!=='fail');
  const evidence={kind:'frame',t:f.at,text:labelText(f)||'экран провала'};
  const near=deaths.find(d=>Math.abs(d.t-f.at)<=interval*1.5);
  if(near){near.evidence.push(evidence);near.respawn=next?.hash;continue;}
  const d=add({t:f.at,type:'death',title:'Экран провала',evidence:[evidence],respawn:next?.hash});deaths.push(d);
 }
 // Repeated attempts: deaths on one level (log), or fail screens followed by the same-looking respawn (frames).
 const groups=[];
 for(const d of deaths.sort((a,b)=>a.t-b.t)){
  const g=groups.find(g=>d.level?g.level===d.level:!g.level&&d.respawn&&hamming(g.hash,d.respawn)<=10);
  if(g)g.items.push(d);else groups.push({level:d.level||'',hash:d.respawn||'',items:[d]});
 }
 for(const e of events.filter(e=>e.kind==='retry')){const g=groups.find(g=>g.level&&g.level===e.level);if(g)g.retries=(g.retries||0)+1;}
 for(const g of groups){
  const n=g.items.length;if(n<2)continue;
  const first=g.items[0],last=g.items.at(-1);
  add({t:first.t,end:last.t,type:'retry',severity:n>=3?'high':'medium',count:n,
   title:n+' '+plural(n,['попытка','попытки','попыток'])+' на одном месте'+(g.level?' · '+g.level:''),
   evidence:[{kind:g.level?'event':'frame',t:first.t,text:(g.level?'смерти на «'+g.level+'»: ':'похожий кадр после провала: ')+g.items.map(x=>clock(x.t)).join(', ')+(g.retries?'; перезапусков: '+g.retries:'')}]});
 }

 // Idle / hesitation: consecutive samples with almost no pixel change.
 let run=null;
 const closeRun=()=>{
  if(!run)return;
  const a=frames[run.start],b=frames[run.end],length=b.at-a.at+interval;
  const screens=frames.slice(run.start,run.end+1).map(f=>f.label?.screen).filter(Boolean);
  if(length>=IDLE_MIN&&!(screens.length&&screens.every(s=>s==='loading'))){
   add({t:a.at,end:b.at,type:'idle',severity:length>=60?'high':length>=35?'medium':'low',seconds:Math.round(length),
    title:'Простой '+Math.round(length)+' с'+(screens[0]==='menu'?' в меню':screens[0]==='dialog'?' в диалоге':''),
    evidence:[{kind:'frame',t:a.at,text:'кадр почти не меняется '+Math.round(length)+' с'+(labelText(a)?'; '+labelText(a):'')}]});
  }
  run=null;
 };
 frames.forEach((f,i)=>{if(i>0&&Number.isFinite(f.diff)&&f.diff<IDLE_DIFF){if(!run)run={start:i-1,end:i};else run.end=i;}else closeRun();});
 closeRun();

 // Speech: negative phrases, close ones merged.
 for(const p of speech){
  const last=out.filter(m=>m.type==='speech').at(-1);
  const ev={kind:'speech',t:p.t,text:p.quote,swearing:p.swearing,approx:p.approx};
  if(last&&p.t-last.t<=8){last.evidence.push(ev);if(p.swearing)last.swearing=true;continue;}
  add({t:p.t,type:'speech',severity:p.kind==='angry'?'low':'medium',title:p.kind==='confused'?'Игрок не понимает':'Негатив',swearing:p.swearing,evidence:[ev]});
 }

 // UI confusion: taps on nothing seen in frames or logged misses.
 const ui=[...frames.filter(f=>f.label?.tapOnNothing).map(f=>({t:f.at,ev:{kind:'frame',t:f.at,text:f.label.tapNote||labelText(f)||'нажатие мимо интерактивных элементов'}})),
  ...events.filter(e=>e.kind==='ui_miss').map(e=>({t:e.t,ev:{kind:'event',t:e.t,text:e.type+(e.detail?' · '+e.detail:'')}}))].sort((a,b)=>a.t-b.t);
 for(const x of ui){
  const last=out.filter(m=>m.type==='ui').at(-1);
  if(last&&x.t-last.t<=20){last.evidence.push(x.ev);last.severity='medium';continue;}
  add({t:x.t,type:'ui',title:'Непонятный интерфейс',evidence:[x.ev]});
 }

 // Several kinds of evidence close together make a moment more serious.
 for(const m of out){
  const gap=(a,b)=>Math.max(0,Math.max(a.t,b.t)-Math.min(a.end??a.t,b.end??b.t));
  const near=out.filter(o=>o!==m&&o.type!==m.type&&gap(o,m)<=15);
  if(near.length){m.severity=up(m.severity);m.near=[...new Set(near.map(o=>o.type))];}
 }
 const moments=out.filter(m=>m.t>=0&&(!duration||m.t<=duration+1)).sort((a,b)=>a.t-b.t);
 const rank=m=>SEV.indexOf(m.severity);
 const kept=moments.length>40?moments.sort((a,b)=>rank(b)-rank(a)||a.t-b.t).slice(0,40).sort((a,b)=>a.t-b.t):moments;
 return kept.map((m,i)=>({id:'m'+(i+1),t:Math.round(m.t*10)/10,end:m.end!==undefined?Math.round(m.end*10)/10:undefined,type:m.type,severity:m.severity,title:m.title,
  evidence:m.evidence.slice(0,6),...m.count?{count:m.count}:{},...m.seconds?{seconds:m.seconds}:{},...m.swearing?{swearing:true}:{},...m.near?{near:m.near}:{},...m.level?{level:m.level}:{}}));
}

// Top issues for the summary, most serious first: computed from the moments, no model.
function summary(moments){
 const lines=[];
 const retries=moments.filter(m=>m.type==='retry').sort((a,b)=>b.count-a.count);
 for(const r of retries.slice(0,2))lines.push({severity:r.severity,text:r.title+' ('+clock(r.t)+(r.end?'–'+clock(r.end):'')+')',t:r.t});
 const idle=moments.filter(m=>m.type==='idle').sort((a,b)=>b.seconds-a.seconds)[0];
 if(idle)lines.push({severity:idle.severity,text:idle.title+' на '+clock(idle.t),t:idle.t});
 const speech=moments.filter(m=>m.type==='speech');
 if(speech.length){const n=speech.reduce((a,m)=>a+m.evidence.length,0);lines.push({severity:speech.some(m=>m.severity==='high')?'high':'medium',text:'Негатив в речи: '+n+' '+plural(n,['раз','раза','раз']),t:speech[0].t});}
 const deaths=moments.filter(m=>m.type==='death');
 if(deaths.length&&!retries.length)lines.push({severity:'low',text:'Смертей и провалов: '+deaths.length,t:deaths[0].t});
 const ui=moments.filter(m=>m.type==='ui');
 if(ui.length)lines.push({severity:ui.some(m=>m.severity!=='low')?'medium':'low',text:'Нажатия мимо интерфейса: '+ui.length,t:ui[0].t});
 return lines.sort((a,b)=>SEV.indexOf(b.severity)-SEV.indexOf(a.severity)).slice(0,4);
}
module.exports={detect,summary,hamming,clock,IDLE_DIFF,IDLE_MIN};
