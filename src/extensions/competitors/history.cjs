// Local state of «Конкуренты» per company (<company data>/extensions/competitors/cache.json):
//   list:<projectId> → [{key, store, id, name, developer, url, added}] — what each project tracks;
//   snap:<key> → {<YYYY-MM-DD>: {version, notes?, rating, ratings, ratingCurrent, size, price, updated, web?}} — one
//   snapshot per day when facts are read. Release notes are stored only when they differ from the previous
//   snapshot, so a long history stays small. Snapshots older than 180 days are dropped.
const KEEP=180;
const DAY=86400000;
const FIELDS=['version','rating','ratings','ratingCurrent','size','price','updated'];

function store(s){return require('../../extension-cache.cjs').store(s.dataRoot,'competitors');}
const projectOf=s=>{try{const t=s.dialogue.active?.();return t?.projectId||s.dialogue.state?.activeProjectId||'general';}catch{return 'general';}};
const projectName=(s,id)=>{try{return s.dialogue.state?.projects?.find(p=>p.id===id)?.name||'';}catch{return '';}};
function list(st,project){const v=st.peek('list:'+project);return Array.isArray(v)?v:[];}
function setList(st,project,rows){st.set('list:'+project,rows.slice(0,50));}
function projects(st,s){
 // Every project that has a list, for settings.
 const known=s.dialogue?.state?.projects||[];
 return known.map(p=>({id:p.id,name:p.name||p.id,items:list(st,p.id)})).filter(p=>p.items.length||p.id===projectOf(s));
}

// Snapshots of one app oldest first, with release notes filled in from the last stored text.
function history(st,key){
 const raw=st.peek('snap:'+key)||{};let notes='';
 return Object.keys(raw).sort().map(day=>{const x=raw[day];if(typeof x.notes==='string')notes=x.notes;return {day,...x,notes};});
}
function record(st,key,day,facts){
 const raw={...(st.peek('snap:'+key)||{})};
 const before=history(st,key).filter(h=>h.day<day).at(-1);
 const row={};for(const f of FIELDS)row[f]=facts[f]??null;
 if(facts.web)row.web=true;
 if(typeof facts.notes==='string'&&facts.notes&&(!before||before.notes!==facts.notes))row.notes=facts.notes;
 else if(raw[day]&&typeof raw[day].notes==='string')row.notes=raw[day].notes;
 raw[day]=row;
 const cutoff=new Date(Date.parse(day+'T00:00:00Z')-KEEP*DAY).toISOString().slice(0,10);
 for(const d of Object.keys(raw))if(d<cutoff)delete raw[d];
 st.set('snap:'+key,raw);
 return history(st,key);
}

// What changed between two snapshots: a new version, other release notes, rating, number of ratings, size, price.
function changes(prev,cur){
 if(!prev||!cur)return [];
 const out=[];
 if(prev.version&&cur.version&&prev.version!==cur.version)out.push({kind:'version',from:prev.version,to:cur.version});
 else if(prev.notes&&cur.notes&&prev.notes.trim()!==cur.notes.trim())out.push({kind:'notes'});
 if(prev.rating!=null&&cur.rating!=null&&Math.abs(cur.rating-prev.rating)>=0.05)out.push({kind:'rating',from:prev.rating,to:cur.rating});
 if(prev.ratings!=null&&cur.ratings!=null&&prev.ratings>0&&Math.abs(cur.ratings-prev.ratings)/prev.ratings>=0.05)out.push({kind:'ratings',from:prev.ratings,to:cur.ratings});
 if(prev.size&&cur.size&&Math.abs(cur.size-prev.size)>=Math.max(1048576,prev.size*0.02))out.push({kind:'size',from:prev.size,to:cur.size});
 if(prev.price!=null&&cur.price!=null&&prev.price!==cur.price)out.push({kind:'price',from:prev.price,to:cur.price});
 return out;
}
// The snapshot to compare today's with: the latest one before today (what changed since the last look), and the
// one closest to `days` ago for trends («у кого вырос рейтинг» over a week or a month).
function previous(rows,day){return rows.filter(r=>r.day<day).at(-1)||null;}
function around(rows,day,days){
 const target=new Date(Date.parse(day+'T00:00:00Z')-days*DAY).toISOString().slice(0,10);
 const older=rows.filter(r=>r.day<=target);
 return older.at(-1)||rows.find(r=>r.day<day)||null;
}
module.exports={store,projectOf,projectName,list,setList,projects,history,record,changes,previous,around,FIELDS};
