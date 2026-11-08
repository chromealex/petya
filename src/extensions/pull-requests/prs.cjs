// GitHub pull requests for the «Pull requests» app: lists (review requested from me, mine, a repository's),
// one PR with files, checks and reviews, and the comment write (only from the card after confirmation).
const github=require('../github/client.cjs');
const MAX_ROWS=8,MAX_DIFF=12000,MAX_FILE_DIFF=3000;

const repoOfApi=url=>{const m=String(url||'').match(/^https:\/\/api\.github\.com\/repos\/([^/]+\/[^/]+)$/);return m&&github.REPO.test(m[1])?m[1]:'';};
const safe=url=>/^https:\/\/github\.com\//.test(url||'')?url:'';
// Check runs of the head commit in one state: failure > pending > success; none when there are no checks.
function checks(runs){
 const list=(runs||[]).map(c=>({name:String(c.name||'').slice(0,120),status:c.status!=='completed'?'pending':['failure','timed_out','cancelled','action_required','startup_failure'].includes(c.conclusion)?'failure':'success',url:safe(c.html_url)}));
 const n=st=>list.filter(c=>c.status===st).length;
 const state=!list.length?'none':n('failure')?'failure':n('pending')?'pending':'success';
 return {state,passed:n('success'),failed:n('failure'),pending:n('pending'),list:[...list].sort((a,b)=>({failure:0,pending:1,success:2}[a.status]-{failure:0,pending:1,success:2}[b.status])).slice(0,8)};
}
// Review state from the latest review of each reviewer.
function reviewState(reviews,requested){
 const latest=new Map();
 for(const r of reviews||[]){const who=r.user?.login;if(!who||r.state==='PENDING')continue;if(r.state==='COMMENTED'&&latest.has(who))continue;latest.set(who,r.state);}
 const states=[...latest.values()];
 if(states.includes('CHANGES_REQUESTED'))return 'changes';
 if(states.includes('APPROVED'))return 'approved';
 if(requested>0)return 'pending';
 if(states.includes('COMMENTED'))return 'commented';
 return 'none';
}
function row(repo,pr){
 return {key:repo+'#'+pr.number,repo,number:pr.number,title:String(pr.title||'').slice(0,300),author:String(pr.user?.login||''),url:safe(pr.html_url),draft:!!pr.draft,
  createdAt:pr.created_at||'',updatedAt:pr.updated_at||'',additions:Number.isFinite(pr.additions)?pr.additions:null,deletions:Number.isFinite(pr.deletions)?pr.deletions:null,
  files:Number.isFinite(pr.changed_files)?pr.changed_files:null,base:String(pr.base?.ref||''),head:String(pr.head?.ref||''),checks:null,review:'none'};
}
// Size, checks and review state of one PR (three calls); a failure leaves that part empty.
async function enrich(api,item){
 try{
  const pr=await api.get('/repos/'+item.repo+'/pulls/'+item.number);
  Object.assign(item,{...row(item.repo,pr),title:item.title||String(pr.title||'')});
  const [runs,reviews]=await Promise.all([
   pr.head?.sha?api.get('/repos/'+item.repo+'/commits/'+pr.head.sha+'/check-runs',{per_page:100}).then(r=>r?.check_runs||[]).catch(()=>null):null,
   api.get('/repos/'+item.repo+'/pulls/'+item.number+'/reviews',{per_page:100}).catch(()=>null)]);
  item.checks=runs?checks(runs):null;
  item.review=reviews?reviewState(reviews,(pr.requested_reviewers||[]).length+(pr.requested_teams||[]).length):'none';
  item.sha=String(pr.head?.sha||'').slice(0,40);item.body=String(pr.body||'').slice(0,2000);
 }catch(e){if(e.status===401)throw e;}
 return item;
}
// GitHub search: review requested from me / authored by me / open PRs of the given repositories.
async function list(s,{scope,repos=[]}){
 const api=github.create(s);
 const repoQuery=repos.slice(0,5).map(r=>'repo:'+github.validRepo(r)).join(' ');
 const q='is:open is:pr archived:false '+(scope==='review'?'review-requested:@me':scope==='mine'?'author:@me':repoQuery)+(scope!=='repo'&&repoQuery&&scope!=='review'&&scope!=='mine'?' '+repoQuery:'');
 const found=await api.get('/search/issues',{q,sort:'updated',order:'desc',per_page:20});
 if(!Array.isArray(found?.items))throw Error('GitHub вернул некорректный ответ поиска.');
 const items=found.items.filter(i=>i.pull_request).map(i=>({...row(repoOfApi(i.repository_url),i),title:String(i.title||'').slice(0,300)})).filter(i=>i.repo);
 const shown=items.slice(0,MAX_ROWS);
 await Promise.all(shown.map(i=>enrich(api,i)));
 return {total:Number(found.total_count)||items.length,items:shown,query:q};
}
// One PR: details, files (first 100), checks, reviews and a capped diff for the summary.
async function one(s,repo,number){
 const api=github.create(s);
 const item=await enrich(api,{repo:github.validRepo(repo),number:Number(number),title:''});
 if(item.additions===null){const pr=await api.get('/repos/'+repo+'/pulls/'+Number(number));Object.assign(item,row(repo,pr));}
 const files=await api.get('/repos/'+repo+'/pulls/'+Number(number)+'/files',{per_page:100});
 item.fileList=(Array.isArray(files)?files:[]).map(f=>({name:String(f.filename||'').slice(0,300),status:String(f.status||''),additions:Number(f.additions)||0,deletions:Number(f.deletions)||0}));
 let diff='';for(const f of Array.isArray(files)?files:[]){if(diff.length>=MAX_DIFF)break;if(!f.patch)continue;diff+='--- '+f.filename+'\n'+String(f.patch).slice(0,MAX_FILE_DIFF)+'\n';}
 item.diff=diff.slice(0,MAX_DIFF);
 return item;
}
async function comment(s,repo,number,body){
 const api=github.create(s);
 const r=await api.send('POST','/repos/'+github.validRepo(repo)+'/issues/'+Number(number)+'/comments',{body});
 return {url:safe(r?.html_url)};
}
module.exports={list,one,comment,checks,reviewState,row,MAX_DIFF};
