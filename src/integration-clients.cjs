// Built-in OAuth clients (Google, Microsoft, Telegram) live in src/integration-clients.json, which is
// kept out of git. Without it the app still starts: users configure their own clients in settings.
const fs=require('node:fs'),path=require('node:path');
const EMPTY={google:null,microsoft:null,telegram:null};
function load(dir=__dirname){
 const file=path.join(dir,'integration-clients.json');let text;
 try{text=fs.readFileSync(file,'utf8');}catch(error){if(error.code==='ENOENT')return {...EMPTY};throw error;}
 let data;try{data=JSON.parse(text);}catch{throw Error('Файл integration-clients.json повреждён: исправьте JSON или удалите файл.');}
 if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Файл integration-clients.json должен содержать объект.');
 return {...EMPTY,...data};
}
module.exports={load,EMPTY};
