const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const {WebSocket}=require('ws');const {createRoomServer}=require('../server/index.cjs');
async function client(url){const ws=new WebSocket(url);let queue=[],waiters=[];ws.on('message',raw=>{const m=JSON.parse(raw);const i=waiters.findIndex(w=>w.type===m.type);if(i>=0){const [w]=waiters.splice(i,1);clearTimeout(w.timer);w.resolve(m);}else queue.push(m);});await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});return {ws,send:m=>ws.send(JSON.stringify(m)),next:type=>{const i=queue.findIndex(m=>m.type===type);if(i>=0)return Promise.resolve(queue.splice(i,1)[0]);return new Promise((resolve,reject)=>{const w={type,resolve,timer:setTimeout(()=>reject(Error('Timeout '+type)),2000)};waiters.push(w);});},clear:()=>queue=[]};}
async function launch(file){const s=createRoomServer({dataFile:file});await new Promise(r=>s.server.listen(0,'127.0.0.1',r));return {s,url:`ws://127.0.0.1:${s.server.address().port}`};}
test('persistent two-player rooms: roles, authorization, sync, conflicts and reconnect',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lisii-test-')),file=path.join(dir,'rooms.json');let {s,url}=await launch(file);const clients=[];
 try{
 const h=await client(url);clients.push(h);h.send({type:'create',protocol:1});const host=await h.next('session');assert.equal(host.role,'host');assert.equal(host.code.length,10);await h.next('state');
 const g=await client(url);clients.push(g);g.send({type:'join',protocol:1,code:host.code});const guest=await g.next('session');assert.equal(guest.role,'guest');await g.next('state');await h.next('state');h.clear();g.clear();
 g.send({type:'action',action:'seat',value:'desk',role:'host'});const changed=await h.next('state');assert.equal(changed.players.guest.seat,'desk');assert.equal(changed.players.host.seat,'stand');await g.next('state');
 h.send({type:'action',action:'seat',value:'bed'});await h.next('state');await g.next('state');g.send({type:'action',action:'seat',value:'bed'});assert.match((await g.next('error')).message,/занята/);
 g.send({type:'action',action:'mood',value:'hungry'});assert.equal((await h.next('state')).players.guest.mood,'hungry');await g.next('state');
 g.send({type:'action',action:'mood',value:'invalid'});assert.match((await g.next('error')).message,/настроение/);
 h.send({type:'cat'});assert.equal((await g.next('cat')).type,'cat');
 const third=await client(url);clients.push(third);third.send({type:'join',protocol:1,code:host.code});assert.match((await third.next('error')).message,/закреплено/);third.send({type:'resume',protocol:1,code:host.code,token:'wrong'});assert.match((await third.next('error')).message,/недействителен/);
 third.send({type:'create',protocol:99});assert.match((await third.next('error')).message,/несовместимы/);
 const disk=JSON.parse(fs.readFileSync(file,'utf8'));assert.equal(disk[host.code].hostHash.includes(host.token),false);assert.equal(disk[host.code].players.guest.mood,'hungry');
 await s.close();({s,url}=await launch(file));const r=await client(url);clients.push(r);r.send({type:'resume',protocol:1,code:host.code,token:host.token});assert.equal((await r.next('session')).role,'host');const restored=await r.next('state');assert.equal(restored.players.host.seat,'bed');assert.equal(restored.players.guest.mood,'hungry');
 r.send({type:'resetGuest'});await r.next('state');await r.next('notice');const newGuest=await client(url);clients.push(newGuest);newGuest.send({type:'join',protocol:1,code:host.code});assert.equal((await newGuest.next('session')).role,'guest');
 }finally{for(const c of clients)c.ws.terminate();await s.close();fs.rmSync(dir,{recursive:true,force:true});}
});
