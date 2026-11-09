// «Kubernetes», the one kubectl and cluster reader shared by the chat turns, the card calls and the log source.
// Tests replace `deps.kubectl` before first use.
const K=require('./kubectl.cjs');
const C=require('./cluster.cjs');
const deps={kubectl:null,cluster:null,settings:()=>({})};
function cluster(s){
 if(s)deps.settings=()=>s.settings||{};
 if(!deps.cluster){
  deps.kubectl=deps.kubectl||K.create({custom:()=>String(deps.settings().kubernetesKubectl||'').trim()});
  deps.cluster=C.create(deps.kubectl,{settings:()=>deps.settings()});
 }
 return deps.cluster;
}
const reset=()=>{deps.kubectl=null;deps.cluster=null;};
module.exports={deps,cluster,reset};
