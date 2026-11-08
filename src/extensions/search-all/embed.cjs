// «Поиск по всему», optional re-ranking by meaning: when an embedding model is already installed in the local Ollama
// (nomic-embed-text, mxbai-embed-large, bge-m3, all-minilm, snowflake-arctic-embed, embeddinggemma …), the top results
// and the question are embedded (POST /api/embed) and the cosine similarity is blended with the BM25 score
// (65% words, 35% meaning). Nothing is downloaded; without such a model the order stays as BM25 gave it.
const {localEndpoint}=require('../../core.cjs');
const EMBED=/(?:embed|bge-|bge:|e5-|minilm|gte-|arctic|nomic|paraphrase|labse|multilingual-e5)/i;
let cache={at:0,base:'',model:''};

function base(s){return new URL(localEndpoint(s.settings.ollamaUrl||'http://127.0.0.1:11434/api/chat')).origin;}
async function model(s,{now=Date.now()}={}){
 const b=base(s);
 if(cache.base===b&&now-cache.at<5*60000)return cache.model;
 let name='';
 try{const r=await s.request(b+'/api/tags',{timeoutMs:3000});name=(r?.models||[]).map(m=>String(m.name||m.model||'')).find(n=>EMBED.test(n))||'';}catch{name='';}
 cache={at:now,base:b,model:name};
 return name;
}
const cosine=(a,b)=>{let d=0,x=0,y=0;for(let i=0;i<a.length;i++){d+=a[i]*b[i];x+=a[i]*a[i];y+=b[i]*b[i];}return x&&y?d/Math.sqrt(x*y):0;};
// Re-orders the first `top` items; returns {items, model} (model '' when nothing was done).
async function rerank(s,question,items,{top=30}={}){
 const name=await model(s);
 if(!name||items.length<2)return {items,model:''};
 const head=items.slice(0,top),rest=items.slice(top);
 const r=await s.request(base(s)+'/api/embed',{method:'POST',headers:{'Content-Type':'application/json'},timeoutMs:8000,
  body:JSON.stringify({model:name,input:[question,...head.map(i=>(i.title+'\n'+String(i.text||'')).slice(0,1000))],truncate:true})});
 const vectors=r?.embeddings;
 if(!Array.isArray(vectors)||vectors.length!==head.length+1)return {items,model:''};
 const max=Math.max(...head.map(i=>i.score))||1;
 const mixed=head.map((i,k)=>({...i,meaning:Math.round(cosine(vectors[0],vectors[k+1])*1000)/1000})).map(i=>({...i,score:Math.round((0.65*i.score/max+0.35*Math.max(0,i.meaning))*1000)/1000}));
 return {items:[...mixed.sort((a,b)=>b.score-a.score),...rest.map(i=>({...i,score:Math.round(0.65*i.score/max*1000)/1000}))],model:name};
}
module.exports={model,rerank,cosine,EMBED,reset:()=>{cache={at:0,base:'',model:''};}};
