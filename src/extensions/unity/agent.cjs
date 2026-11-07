// Mutating and unknown actions always become proposals, regardless of server annotations.
function readOnly({name,arguments:args}) {
  if(name==='read_resource')return true;
  if(name==='read_console' && args.action==null)return true;
  if(['find_gameobjects','get_test_job','get_sha'].includes(name))return true;
  const actions={
    read_console:['get'],
    manage_physics:['ping','get_settings','get_collision_matrix','raycast','raycast_all','linecast','shapecast','overlap','validate','get_rigidbody'],
    manage_scene:['get_hierarchy','get_active','get_build_settings'],
    manage_asset:['search','get_info','get_components'],
    manage_components:['get_component','get_components'],
    manage_script:['read'],
    manage_animation:['get_animator_info','get_clip_info']
  };
  return actions[name]?.includes(args.action) || false;
}
async function assist(s,client,command,check,report) {
  const native=require('./native.cjs');
  const catalog=await native.discover(client,check);
  return require('../agent.cjs').run({s,command,catalog,readOnly,check,report,
    history:(s.dialogue.active()?.messages||[]).filter(m=>!m.pending),
    invoke:call=>native.execute(client,call.name==='read_resource'?'read_resource':'call_tool',
      call.name==='read_resource'?call.arguments:call,check)});
}
module.exports={assist,readOnly};
