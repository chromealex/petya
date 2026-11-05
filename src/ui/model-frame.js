window.chatModelFrame=function(data){
  const frame=document.createElement('iframe');
  frame.className='chat-model-frame';frame.title='3D · '+data.name;
  frame.setAttribute('sandbox','allow-scripts');
  frame.addEventListener('load',()=>frame.contentWindow.postMessage({format:data.modelFormat,bytes:data.modelData},'*'),{once:true});
  frame.src='model-viewer.html';return frame;
};
