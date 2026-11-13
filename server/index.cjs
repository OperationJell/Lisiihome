const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {WebSocketServer,WebSocket}=require('ws');
const PROTOCOL=1, MOODS=new Set(['normal','tired','sleepy','happy','hungry']), SEATS=new Set(['sofa','desk','bed','stand']);
const digest=t=>crypto.createHash('sha256').update(t).digest('hex');
const newPlayer=()=>({seat:'stand',mood:'normal',since:Date.now()});
function createRoomServer({dataFile=process.env.DATA_FILE||path.join(__dirname,'data','rooms.json')}={}){
 let rooms={};try{rooms=JSON.parse(fs.readFileSync(dataFile,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 const save=()=>{fs.mkdirSync(path.dirname(dataFile),{recursive:true});fs.writeFileSync(dataFile+'.tmp',JSON.stringify(rooms),{mode:0o600});fs.renameSync(dataFile+'.tmp',dataFile);};
 const sockets=new Map(), limits=new Map();
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type','application/json');if(req.url==='/health'){res.end(JSON.stringify({ok:true,protocol:PROTOCOL,version:'0.1.0'}));}else{res.writeHead(404);res.end('{"error":"not found"}');}});
 const wss=new WebSocketServer({server,maxPayload:4096});
 const send=(ws,data)=>{if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(data));};
 const snapshot=code=>({type:'state',code,serverTime:Date.now(),players:rooms[code].players,online:{host:sockets.has(code+':host'),guest:sockets.has(code+':guest')}});
 const broadcast=(code,payload=snapshot(code))=>{for(const role of ['host','guest']){const ws=sockets.get(code+':'+role);if(ws)send(ws,payload);}};
 function attach(ws,code,role,token){const key=code+':'+role;const old=sockets.get(key);if(old&&old!==ws){send(old,{type:'replaced',message:'Открыто другое подключение этого персонажа'});old.close(4001,'Reconnected elsewhere');}ws.code=code;ws.role=role;sockets.set(key,ws);send(ws,{type:'session',code,role,token,protocol:PROTOCOL});broadcast(code);}
 wss.on('connection',(ws,req)=>{
 const ip=req.socket.remoteAddress;ws.alive=true;ws.on('pong',()=>ws.alive=true);let recent=[];
 ws.on('message',raw=>{try{
 const now=Date.now();recent=recent.filter(t=>now-t<1000);if(recent.length>=20)return send(ws,{type:'error',message:'Слишком много действий'});recent.push(now);
 const m=JSON.parse(raw);if(!m||typeof m!=='object')throw Error('Некорректное сообщение');
 if(!ws.code){
 if(m.protocol!==PROTOCOL)return send(ws,{type:'error',message:'Версии игры несовместимы. Обновите игру.'});
 const attempts=(limits.get(ip)||[]).filter(t=>now-t<60000);if(attempts.length>=30)throw Error('Подождите минуту перед повторным входом');attempts.push(now);limits.set(ip,attempts);
 if(m.type==='create'){
 if(Object.keys(rooms).length>=10000)throw Error('Лимит комнат сервера достигнут');
 let code;do{code=crypto.randomBytes(5).toString('hex').toUpperCase();}while(rooms[code]);const token=crypto.randomBytes(32).toString('hex');
 rooms[code]={created:now,hostHash:digest(token),guestHash:null,players:{host:newPlayer(),guest:newPlayer()}};save();attach(ws,code,'host',token);return;
 }
 const code=String(m.code||'').toUpperCase().replace(/\s/g,'');const room=rooms[code];if(!room)throw Error('Комната не найдена. Проверьте код и сервер.');
 if(m.type==='resume'){
 const hash=digest(String(m.token||''));const role=room.hostHash===hash?'host':room.guestHash===hash?'guest':null;if(!role)throw Error('Ключ подключения недействителен');attach(ws,code,role,m.token);return;
 }
 if(m.type==='join'){
 if(room.guestHash)throw Error('Место гостя уже закреплено. Нужен сохранённый вход или сброс приглашения администратором.');
 const token=crypto.randomBytes(32).toString('hex');room.guestHash=digest(token);save();attach(ws,code,'guest',token);return;
 }
 throw Error('Сначала войдите в комнату');
 }
 const room=rooms[ws.code];const p=room.players[ws.role];
 if(m.type==='action'){
 if(m.action==='seat'){
 if(!SEATS.has(m.value))throw Error('Неизвестное место');
 const other=room.players[ws.role==='host'?'guest':'host'];
 if(m.value==='bed'&&other.seat==='bed')throw Error('Кровать уже занята');
 if(p.seat!==m.value){p.seat=m.value;p.since=now;}
 }else if(m.action==='mood'){
 if(!MOODS.has(m.value))throw Error('Неизвестное настроение');p.mood=m.value;
 }else throw Error('Неизвестное действие');
 save();broadcast(ws.code);
 }else if(m.type==='cat'){broadcast(ws.code,{type:'cat',at:now});}
 else if(m.type==='resetGuest'&&ws.role==='host'){
 const guest=sockets.get(ws.code+':guest');if(guest){send(guest,{type:'revoked',message:'Приглашение сброшено администратором'});guest.close(4003,'Revoked');sockets.delete(ws.code+':guest');}
 room.guestHash=null;room.players.guest=newPlayer();save();broadcast(ws.code);send(ws,{type:'notice',message:'Место гостя освобождено. Можно снова войти по коду.'});
 }else if(m.type==='ping')send(ws,{type:'pong',serverTime:now});
 }catch(e){send(ws,{type:'error',message:e.message||'Ошибка запроса'});}});
 ws.on('close',()=>{const key=ws.code+':'+ws.role;if(sockets.get(key)===ws){sockets.delete(key);if(rooms[ws.code])broadcast(ws.code);}});
 ws.on('error',()=>{});
 });
 const heartbeat=setInterval(()=>{for(const ws of wss.clients){if(!ws.alive){ws.terminate();continue;}ws.alive=false;ws.ping();}for(const [ip,times]of limits)if(times.every(t=>Date.now()-t>60000))limits.delete(ip);},30000);heartbeat.unref();
 return {server,wss,close:()=>new Promise(resolve=>{clearInterval(heartbeat);for(const ws of wss.clients)ws.terminate();wss.close(()=>server.close(resolve));})};
}
if(require.main===module){const instance=createRoomServer();const port=Number(process.env.PORT||8787);instance.server.listen(port,'0.0.0.0',()=>console.log(`LISII HOME server on port ${port}`));for(const s of ['SIGTERM','SIGINT'])process.on(s,()=>instance.close().then(()=>process.exit(0)));}
module.exports={createRoomServer};
