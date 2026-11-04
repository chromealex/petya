const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {EventEmitter}=require('node:events');const {PassThrough}=require('node:stream');
const {LocalImages,imagePrompt,png}=require('../src/local-images.cjs');
const image='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC1kAAAAASUVORK5CYII=';
for(const command of ['Нарисуй кота','Петя, нарисуй кота','Сгенерируй изображение: кота','Сделай мне картинку кота','Пожалуйста, изобрази кота'])assert.equal(imagePrompt(command),'кота');
for(const command of ['Не рисуй кота','Как нарисовать кота?','Объясни слово «нарисуй»','Нарисуйка','Создай задачу','Покажи изображение кота'])assert.equal(imagePrompt(command),null);
assert.equal(imagePrompt('Нарисуй'),'');assert.throws(()=>png('garbage'));assert.throws(()=>png('data:image/png;base64,'+image));assert(png(image).length);
const root=fs.mkdtempSync(path.join(os.tmpdir(),'petya-images-test-'));
const binary=process.platform==='win32'?'Scripts/python.exe':'bin/python';fs.mkdirSync(path.dirname(path.join(root,'runtime/images',binary)),{recursive:true});fs.writeFileSync(path.join(root,'runtime/images',binary),'');fs.mkdirSync(path.join(root,'runtime/models/sd-turbo'),{recursive:true});fs.writeFileSync(path.join(root,'runtime/models/sd-turbo/.petya-ready'),'{}');
let child,sent;
function spawnProcess(executable,args,options){assert.equal(options.shell,false);assert.equal(executable,path.join(root,'runtime/images',binary));assert(args[1].endsWith('local-images.py'));child=new EventEmitter();child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();sent='';child.stdin.on('data',chunk=>sent+=chunk);child.kill=()=>{child.killed=true;};return child;}
(async()=>{try{
 const generator=new LocalImages({roots:[root],spawnProcess,timeout:1000});assert.equal(generator.status().ready,true);
 let task=generator.generate('cat $(touch /tmp/no-shell)');assert.equal(JSON.parse(sent).prompt,'cat $(touch /tmp/no-shell)');await assert.rejects(generator.generate('dog'),/Дождитесь/);child.stdout.write(JSON.stringify({image,device:'cpu'}));child.emit('close',0);assert.equal((await task).image,image);assert.equal(generator.status().busy,false);
 task=generator.generate('cat');child.stdout.write(JSON.stringify({error:'out of memory'}));child.emit('close',1);await assert.rejects(task,/out of memory/);
 task=generator.generate('cat');child.stdout.write('not json');child.emit('close',0);await assert.rejects(task);
 task=generator.generate('cat');const old=child;generator.stop();assert(old.killed);await assert.rejects(task,/остановлена/);assert.equal(generator.status().busy,false);
 task=generator.generate('dog');old.emit('close',1);child.stdout.write(JSON.stringify({image}));child.emit('close',0);await task;
 task=generator.generate('cat');child.emit('error',Error('ENOENT'));await assert.rejects(task,/запустить/);
 const slow=new LocalImages({roots:[root],spawnProcess,timeout:5});task=slow.generate('cat');await assert.rejects(task,/10 минут/);assert(child.killed);
 await assert.rejects(new LocalImages({roots:[]}).generate('cat'),/не установлена/);await assert.rejects(generator.generate(''),/Опишите/);
 const worker=fs.readFileSync(path.join(__dirname,'../src/local-images.py'),'utf8');assert(worker.includes("os.environ['HF_HUB_OFFLINE'] = '1'"));assert(worker.includes('local_files_only=True'));assert(worker.includes('use_safetensors=True'));
 console.log('Local images: routing, offline runtime, validation, errors, cancellation, concurrency and timeout passed.');
}finally{fs.rmSync(root,{recursive:true,force:true});}})().catch(error=>{console.error(error);process.exitCode=1;});
