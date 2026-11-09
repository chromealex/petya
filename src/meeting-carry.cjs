// A meeting recording outlives a company switch. The recorder of each company (src/features/meeting-memory.cjs)
// registers here; when the company is closed for a switch while its meeting is being recorded, the recorder is kept
// and goes on recording in the background for that company: its audio is saved to that company's folder, recognition
// waits until the company is open again (it uses that company's speech settings and memory). Opening the company
// again adopts the same recorder instead of creating a new one. Only one meeting is recorded at a time: another
// company neither starts a recording nor offers one while this one runs, and its «Остановить встречу» stops it.
// This module outlives the per-company services.
const owners=new Map(); // companyId → {local, recording, bind, timer, carried, name}
let quitHooked=false;

function hookQuit(){
 if(quitHooked)return;quitHooked=true;
 try{require('electron').app.once('before-quit',async()=>{for(const entry of owners.values())if(entry.carried){clearInterval(entry.timer);await entry.local.stop(false).catch(()=>{});}});}catch{/* outside Electron */}
}
// The recorder registered for a company: {kept:true, ...entry} when it was carried through a switch, else null.
function adopt(company){const entry=owners.get(company);if(!entry?.carried)return null;entry.carried=false;return entry;}
function register(company,entry){owners.set(company,{...entry,carried:false});return owners.get(company);}
// The company closes for a switch: a busy recorder is kept (true), an idle one is forgotten (false).
function carry(company){
 const entry=owners.get(company);if(!entry)return false;
 if(!entry.local.snapshot().busy){owners.delete(company);return false;}
 entry.carried=true;entry.recording.held=true;hookQuit();return true;
}
function drop(company){owners.delete(company);}
// The company whose meeting is being recorded now, other than `except`: {id, name, local} or null.
function recordingElsewhere(except){
 for(const [id,entry] of owners)if(id!==except&&entry.local.snapshot().busy)return {id,name:entry.name?.()||'',local:entry.local};
 return null;
}
// Ids of companies with a meeting being recorded (the badge on the company tabs).
function recording(){return [...owners].filter(([,entry])=>entry.local.snapshot().busy).map(([id])=>id);}
// A carried recorder that finished: it stops ticking and waits for its company to be opened for recognition.
function settle(company){const entry=owners.get(company);if(entry?.carried&&!entry.local.snapshot().busy)clearInterval(entry.timer);}
module.exports={adopt,register,carry,drop,recordingElsewhere,recording,settle,_owners:owners};
