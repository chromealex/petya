const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
(async()=>{
 const elements=[],calls=[];
 class Element{
  constructor(tag){this.tag=tag;this.dataset={};this.children=[];}
  append(...items){this.children.push(...items);}setAttribute(){}
  replaceChildren(...items){this.children=items;}
 }
 const document={createElement:tag=>{const node=new Element(tag);elements.push(node);return node;},body:new Element('body'),querySelector:()=>null,getElementById:()=>null,addEventListener(){}};
 const state={chatId:'chat-a',current:'',defaultModel:'',models:[{name:'petya-v1',provider:'petya',size:0}],error:''};
 vm.runInNewContext(fs.readFileSync(require.resolve('../src/ui/chat-model.js'),'utf8'),{
  document,window:{addEventListener(){},petya:{chatModels:async()=>state,feature:async()=>({models:[]}),chatModelSet:async(...args)=>{calls.push(args);return {current:args[0]};}}},
  Option:class{constructor(text,value){this.text=text;this.value=value;}},MutationObserver:class{observe(){}},notice(){}
 });
 await new Promise(resolve=>setImmediate(resolve));
 const select=elements.find(n=>n.tag==='select');assert.equal(select.disabled,false);assert.ok(select.children.some(n=>n.value==='petya-v1'));
 select.value='petya-v1';await select.onchange();assert.deepEqual(calls[0],['petya-v1','chat-a','']);
 select.value='';await select.onchange();assert.deepEqual(calls[1],['','chat-a','petya-v1']);
 console.log('Chat model picker passed: own runtime option without Ollama and chat/previous-selection binding.');
})().catch(e=>{console.error(e);process.exitCode=1;});
