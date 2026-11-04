const {createHash}=require('node:crypto');
const {localEndpoint}=require('./core.cjs');
const RECOMMENDED='qwen3.5:9b';
function registryPath(model){const match=String(model).match(/^(?:([a-zA-Z0-9_-]+)\/)?([a-zA-Z0-9_.-]+)(?::([a-zA-Z0-9_.-]+))?$/);if(!match||String(model).length>180)throw Error('Модель не опубликована в поддерживаемом реестре.');return `https://registry.ollama.ai/v2/${match[1]||'library'}/${match[2]}/manifests/${match[3]||'latest'}`;}
const normalize=name=>name.includes(':')?name:name+':latest';
class ModelUpdates{
 constructor({settings,ready,fetcher=fetch,now=Date.now}){Object.assign(this,{settings,ready,fetcher,now});this.cache=null;this.pending=null;}
 async manifest(model){const response=await this.fetcher(registryPath(model),{redirect:'error',headers:{Accept:'application/vnd.docker.distribution.manifest.v2+json'},signal:AbortSignal.timeout(12000)});if(response.status===404)return null;if(!response.ok)throw Error('Реестр моделей недоступен: HTTP '+response.status);const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>1024*1024)throw Error('Некорректный ответ реестра моделей.');const value=JSON.parse(bytes.toString());if(!Array.isArray(value.layers))throw Error('Не удалось определить версию модели.');return {digest:createHash('sha256').update(bytes).digest('hex'),size:value.layers.reduce((n,l)=>n+(Number.isSafeInteger(l.size)&&l.size>0?l.size:0),0)};}
 check(force=false){const settings=this.settings(),key=JSON.stringify([settings.model,settings.ollamaUrl]);if(this.pending)return this.pending;if(!force&&this.cache?.key===key&&this.now()-this.cache.checkedAt<6*3600000)return Promise.resolve(this.cache);this.pending=this.inspect(settings,key).finally(()=>this.pending=null);return this.pending;}
 async inspect(settings,key){const result={key,checkedAt:this.now(),items:[],unavailable:[],error:''};try{
 const response=await this.fetcher(new URL('/api/tags',localEndpoint(settings.ollamaUrl)),{signal:AbortSignal.timeout(5000),redirect:'error'});if(!response.ok)throw Error('Запустите Ollama, чтобы проверить обновления.');const tags=await response.json();if(!Array.isArray(tags.models))throw Error('Не удалось прочитать установленные модели.');
 const selected=String(settings.model||'');const candidates=[...new Set([selected,...(!selected||/^qwen3:/i.test(selected)?[RECOMMENDED]:[])].filter(Boolean))];
 for(const model of candidates){const remote=await this.manifest(model);if(!remote){result.unavailable.push(model);continue;}const local=tags.models.find(m=>normalize(m.name||'')===normalize(model));if(!local||String(local.digest).replace(/^sha256:/,'')!==remote.digest)result.items.push({model,digest:remote.digest,size:remote.size,kind:local?'update':'install',current:model===selected});}
 }catch(error){result.error=error.message||'Не удалось проверить обновления.';}if(key===JSON.stringify([this.settings().model,this.settings().ollamaUrl]))this.cache=result;return result;}
 async install(model){if(this.ready.state.busy)throw Error('Уже идёт подготовка модели.');const state=await this.check();if(!state.items.some(item=>item.model===model))throw Error('Обновите список доступных моделей.');const result=await this.ready.start(model,{forcePull:true});this.cache=null;return result;}
}
module.exports={ModelUpdates,registryPath};
