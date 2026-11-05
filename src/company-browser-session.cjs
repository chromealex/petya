const path=require('node:path');
function companySession(session,root,name,persistent=true){
 if(!root)return session.fromPartition((persistent?'persist:':'')+name);
 return persistent?session.fromPath(path.join(root,'Partitions',name)):session.fromPartition('company:'+root+':'+name);
}
module.exports={companySession};
