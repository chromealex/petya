// «Запись экрана → баг», the draft: title, steps, expected, actual. The local model may only describe what is in
// the attached log lines: it gets the numbered lines (errors and warnings first) and must cite the line numbers it
// used; a description that cites no existing error/warning line is dropped. It never writes steps — the user does,
// in the card (from their own note when it has some). Without a model or without log lines, the draft is built by
// code from the user's note and the first error.
const kit=require('../app-kit.cjs');

const SYSTEM='Ты пишешь поле «Фактически» для баг-репорта игры строго по строкам лога. Описывай только то, что написано в приведённых строках: ошибки, исключения, предупреждения. Не придумывай шаги, причины и действия игрока. Укажи номера строк, на которые опираешься. Ответ — JSON {title, actual, lines}.';
const SCHEMA={type:'object',properties:{title:{type:'string'},actual:{type:'string'},lines:{type:'array',items:{type:'integer'}}},required:['title','actual','lines']};

// «шаги: открыть магазин, купить меч» or numbered lines in the note → the user's own steps.
function stepsIn(note){
 const t=String(note||'');
 const m=/шаги\s*:?\s*(.+)$/iu.exec(t);
 if(m)return m[1].split(/\s*(?:[;,]|\d+[.)]\s+|→|->)\s*/u).map(x=>x.trim()).filter(Boolean).slice(0,12);
 const numbered=[...t.matchAll(/(?:^|\s)\d+[.)]\s+([^\d]+?)(?=\s+\d+[.)]\s|$)/gu)].map(x=>x[1].trim()).filter(Boolean);
 return numbered.length>=2?numbered.slice(0,12):[];
}
// «…, должно было открыться окно» → expected.
function expectedIn(note){const m=/(?:должн\p{L}*|ожида\p{L}*|а\s+надо|хотя\s+должн\p{L}*)\s+(?:было\s+)?(.+)$/iu.exec(String(note||''));return m?m[1].replace(/[.!]+$/,'').trim().slice(0,300):'';}
const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
function firstError(lines){return (lines||[]).find(l=>l.level==='error'&&l.during!==false)||(lines||[]).find(l=>l.level==='error')||null;}
function fallbackTitle({note,lines,window}){
 const n=clean(String(note||'').replace(/шаги\s*:?.*$/iu,'').replace(/(?:должн|ожида).*/iu,'')).replace(/[,.;:]+$/,'');
 if(n)return n.charAt(0).toUpperCase()+n.slice(1,200);
 const e=firstError(lines);
 if(e){const m=/(\w+(?:Exception|Error))\b:?\s*(.{0,120})/.exec(e.text);return (m?m[1]+(m[2]?': '+m[2]:''):e.text.slice(0,140)).trim();}
 return window?'Баг: '+window.slice(0,120):'';
}

async function draft(s,{lines=[],note='',window=''}={}){
 const steps=stepsIn(note),expected=expectedIn(note);
 const base={title:fallbackTitle({note,lines,window}),steps,expected,actual:'',evidence:[],model:false};
 const e=firstError(lines);
 if(e)base.actual='В логе: '+e.text.slice(0,300);
 const important=lines.filter(l=>l.level==='error'||l.level==='warning');
 if(!important.length)return base;
 // Errors and warnings first, then the lines around them, at most 60.
 const near=new Set();for(const l of important)for(let k=l.n-2;k<=l.n+2;k++)near.add(k);
 const shown=lines.filter(l=>near.has(l.n)).slice(-60);
 let answer=null;
 try{answer=await kit.modelJSON(s,{system:SYSTEM,user:{note:clean(note).slice(0,300),log:shown.map(l=>l.n+': '+l.text.slice(0,300))},schema:SCHEMA,predict:400});}catch{answer=null;}
 if(!answer||typeof answer.actual!=='string')return base;
 const valid=new Set(important.map(l=>l.n));
 const cited=[...new Set((Array.isArray(answer.lines)?answer.lines:[]).map(Number).filter(n=>valid.has(n)))].slice(0,12);
 if(!cited.length||!clean(answer.actual))return base;
 return {...base,title:clean(note)?base.title:clean(answer.title).slice(0,200)||base.title,actual:clean(answer.actual).slice(0,1200),evidence:cited,model:true};
}
module.exports={draft,stepsIn,expectedIn,fallbackTitle,SYSTEM};
