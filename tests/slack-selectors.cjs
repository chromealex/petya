const assert = require('node:assert/strict');
const { resolveChannels, matches } = require('../src/slack.cjs');
const { checkConnection } = require('../src/connections.cjs');
const { SlackContext } = require('../src/slack-context.cjs');
(async () => {
  assert(matches('jw-dev', ['jw-*'])); assert(!matches('xjw-dev', ['jw-*'])); assert(!matches('jwXdev', ['jw.*']));
  const ids = Array.from({length: 25}, (_, i) => 'C' + i);
  assert.deepEqual(await resolveChannels(ids.join(','), '', () => assert.fail()), ids);
  let pages = 0;
  const list = async url => {
    const u = new URL(url);
    if (u.pathname.endsWith('auth.test')) return {ok:true};
    if (u.pathname.endsWith('history')) return {ok:true, messages:[]};
    pages++;
    return u.searchParams.has('cursor') ? {ok:true, channels:[{id:'C1',name:'jw-dev'}, {id:'C2',name:'jw-art'}, {id:'C3',name:'other'}, {id:'C4',name:'jw-old',is_archived:true}]} : {ok:true,channels:[],response_metadata:{next_cursor:'second'}};
  };
  assert.deepEqual(await resolveChannels('jw-*, D1', 't', list), ['D1','C1','C2']);
  assert.equal(pages,2);
  assert.deepEqual(await resolveChannels('*', 't', list), ['C1','C2','C3']);
  assert((await checkConnection('slack', {slackToken:'t', slackChannels:'jw-*'},list)).ready);
  await assert.rejects(resolveChannels('missing-*','t',list), /Не найдены/);
  await assert.rejects(resolveChannels('*','t',async()=>({ok:false,error:'missing_scope'})), /channels:read/);
  let now=0, limited=true;
  const ctx = new SlackContext({settings:()=>({slackToken:'t',slackChannels:'jw-*, C1',contextDays:'7'}),store:{items:[],put(){}},now:()=>now,request:async url=>{
    if (limited) {limited=false;const e=new Error('rate');e.status=429;e.retryAfter=120;throw e;}
    return list(url);
  }});
  await ctx.start(); assert.equal(ctx.queue[0].method,'conversations.list');
  now=120000; await ctx.tick();
  await ctx.tick(); now+=61000; await ctx.tick();
  assert.deepEqual([...ctx.discovered],['C1','C2']);
  assert.equal(ctx.queue.filter(j=>j.channel==='C1').length,0,'explicit channel was already loaded and not duplicated');
  assert.equal(ctx.queue.filter(j=>j.channel==='C2').length,1);
  console.log('Slack selectors: connection check, background discovery, pagination, masks, IDs, deduplication and Retry-After passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
