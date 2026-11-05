const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
class Store {
 constructor(directory,key){this.directory=directory;this.key=Buffer.from(key,'hex');if(this.key.length!==32)throw Error('ZOOM_STORAGE_KEY must contain 32 bytes in hex');fs.mkdirSync(directory,{recursive:true,mode:0o700});}
 file(id){if(!/^[a-f0-9-]{36}(?:-\d+)?$/.test(id))throw Error('Invalid object ID');return path.join(this.directory,id+'.enc');}
 write(id,value){const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',this.key,iv),bytes=Buffer.concat([cipher.update(JSON.stringify(value)),cipher.final()]);const file=this.file(id);fs.writeFileSync(file+'.tmp',Buffer.concat([iv,cipher.getAuthTag(),bytes]),{mode:0o600});fs.renameSync(file+'.tmp',file);}
 read(id){const bytes=fs.readFileSync(this.file(id)),decipher=crypto.createDecipheriv('aes-256-gcm',this.key,bytes.subarray(0,12),{authTagLength:16});decipher.setAuthTag(bytes.subarray(12,28));return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString());}
 remove(id){fs.rmSync(this.file(id),{force:true});}
 ids(){return fs.readdirSync(this.directory).filter(n=>/^[a-f0-9-]{36}\.enc$/.test(n)).map(n=>n.slice(0,-4));}
}
module.exports={Store};
