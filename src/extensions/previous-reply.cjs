// A queued question is already visible while its extension is being selected.
module.exports=function previousReply(topic){
  const messages=topic?.messages;
  const last=messages?.at(-1);
  const reply=last?.role==='user'&&last.pending?messages.at(-2):last;
  return reply?.role==='assistant'?reply:undefined;
};
