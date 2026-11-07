// A command in free words reaches its function: the router restates it and the chat keeps the user's words.
const http=require('node:http'),assert=require('node:assert/strict');
module.exports=async win=>{
 const seen=[];const server=http.createServer((req,res)=>{let raw='';req.on('data',b=>raw+=b);req.on('end',()=>{
  const body=JSON.parse(raw||'{}');seen.push({url:req.url,body});res.setHeader('Content-Type','application/json');
  if(req.url==='/api/show')return res.end(JSON.stringify({details:{}}));
  const tools=body.format?.properties?.tool?.enum||[];
  if(tools.includes('recurring'))return res.end(JSON.stringify({message:{content:JSON.stringify({tool:'recurring',confidence:.95,recipeId:'',question:'',canonical:'проверяй почту каждые 30 минут'})},done:true}));
  if(tools.length)return res.end(JSON.stringify({message:{content:JSON.stringify({tool:'chat',confidence:.95,recipeId:'',question:''})},done:true}));
  res.end(JSON.stringify({message:{content:body.format?'{}':'Обычный ответ.'},done:true}));
 });});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port+'/api/chat';
 const js=code=>win.webContents.executeJavaScript('(async()=>('+code+'))()');
 const original=await js('window.petya.settings()');
 try{
  await js(`window.petya.saveSettings({model:'route-test',ollamaUrl:${JSON.stringify(url)},semanticTools:'true'})`);
  await js("window.petya.dialogueSelect('')");
  const result=await js("window.petya.converse('хочу чтобы ты следил за почтой, ну типа полчаса интервал')");
  assert.match(result.text,/30 минут/,'recurring did not answer: '+result.text);assert.equal(result.understoodAs,'проверяй почту каждые 30 минут');
  const users=result.messages.filter(m=>m.role==='user');assert.equal(users.at(-1).text,'хочу чтобы ты следил за почтой, ну типа полчаса интервал');assert.equal(users.at(-1).understoodAs,'проверяй почту каждые 30 минут');
  assert.equal(users.filter(m=>m.text==='проверяй почту каждые 30 минут').length,0,'canonical text shown as the user message');
  const list=await js("window.petya.feature('recurring','list')");assert(list.some(r=>/почт/.test(r.command)),'recurring command not saved');
  for(const r of list)await js(`window.petya.feature('recurring','remove',${JSON.stringify(r.id)})`);
  console.log('Capabilities UI: free wording restated, run by its function, user words kept passed');
 }finally{await js('window.petya.saveSettings('+JSON.stringify(original)+')');server.close();}
};
