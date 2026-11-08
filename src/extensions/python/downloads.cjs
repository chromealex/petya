// Whether the Python image (extension.json "downloads") is already in the local Docker.
module.exports={async present(){
 const {PythonRuntime}=require('./runtime.cjs');
 const status=await new PythonRuntime().status().catch(()=>({ready:false}));
 return status.ready?['image']:[];
}};
