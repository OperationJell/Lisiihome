'use strict';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const desktop=window.desktop;
if(!desktop)document.body.classList.add('preview');
const canvas=$('#scene'),ctx=canvas.getContext('2d'),W=1402,H=1122;
let prefs={},role='host',mode='offline',socket=null,reconnectTimer,retry=0,sessionAction=null,offset=0,catUntil=0,lastIgnore=false,hover=null,toastTimer;
const player=()=>({seat:'sofa',mood:'normal',since:Date.now()});
let state={host:player(),guest:player()},online={host:true,guest:false};
let spriteRegions=[],frameTargets={},positions={},ready=false;
const room=new Image(),sprites=new Image();room.src='assets/room.png';sprites.src='assets/characters.png';
const roomMask=document.createElement('canvas');roomMask.width=W;roomMask.height=H;const mask=roomMask.getContext('2d',{willReadFrequently:true});
const spriteMask=document.createElement('canvas');let sctx;
const safeLoad=()=>{try{return JSON.parse(localStorage.getItem('lisii-settings')||'{}');}catch{return {};}};
async function save(data){Object.assign(prefs,data);if(desktop)await desktop.save(data);else localStorage.setItem('lisii-settings',JSON.stringify(prefs));}
function toast(text){$('#toast').textContent=text;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,4200);}
function modal(id){for(const el of $$('.panel'))el.hidden=true;$(id).hidden=false;desktop?.ignore(false);lastIgnore=false;}
function dismiss(){for(const el of $$('.panel'))el.hidden=true;}
function connectionStatus(text,status){$('#network-message').textContent=text;$('#dot').className=status||'';$('#count').textContent=mode==='online'?`${Object.values(online).filter(Boolean).length}/2`:mode==='connecting'?'…':'1/2';}
function updateLobby(){
 $('#saved-room').hidden=!prefs.code;$('#room-code').textContent=prefs.code||'';$('#role-label').textContent=(prefs.role==='guest'?'Ты — парень':'Ты — девушка · администратор')+(mode==='online'?' · подключено':'');
 $('#reset-guest').hidden=role!=='host'||mode!=='online';$('#server-url').value=prefs.server||'';$('#offline-tools').hidden=mode!=='offline';$('#switch-role').textContent=role==='host'?'Управлять парнем':'Управлять девушкой';
}
function normalizeServer(value){const u=new URL(value.trim());if(u.protocol==='https:')u.protocol='wss:';if(u.protocol==='http:')u.protocol='ws:';if(!['ws:','wss:'].includes(u.protocol)||u.username||u.password)throw Error('Введите адрес сервера: wss://домен или ws://IP:8787');u.hash='';return u.toString();}
function stopConnection(){clearTimeout(reconnectTimer);if(socket){socket.onclose=null;socket.close();socket=null;}}
async function connect(action){
 let url;try{url=normalizeServer($('#server-url').value||prefs.server||'');}catch(e){connectionStatus(e.message);return;}
 if(action==='join'&&!$('#join-code').value.trim()){connectionStatus('Введите код комнаты');return;}
 stopConnection();mode='connecting';sessionAction=action;await save({server:url});connectionStatus('Подключаемся…','connecting');
 const ws=new WebSocket(url);socket=ws;
 const timeout=setTimeout(()=>{if(ws.readyState!==WebSocket.OPEN)ws.close();},10000);
 ws.onopen=()=>{clearTimeout(timeout);const payload={type:action,protocol:1};if(action==='join')payload.code=$('#join-code').value.trim().toUpperCase();if(action==='resume'){payload.code=prefs.code;payload.token=prefs.token;}ws.send(JSON.stringify(payload));};
 ws.onmessage=async event=>{let m;try{m=JSON.parse(event.data);}catch{return;}
 if(m.type==='session'){role=m.role;retry=0;mode='online';await save({code:m.code,token:m.token,role:m.role});dismiss();updateLobby();toast('Добро пожаловать домой');}
 else if(m.type==='state'){state=m.players;online=m.online;offset=m.serverTime-Date.now();connectionStatus('Подключено','connected');updateLobby();}
 else if(m.type==='cat')catUntil=performance.now()+2200;
 else if(m.type==='error'){connectionStatus(m.message);toast(m.message);if(mode==='connecting'){ws.onclose=null;ws.close();mode='offline';updateLobby();}}
 else if(m.type==='notice')toast(m.message);
 else if(m.type==='replaced'||m.type==='revoked'){stopConnection();mode='offline';if(m.type==='revoked')await save({token:null,code:null});toast(m.message);modal('#lobby');updateLobby();}
 };
 ws.onerror=()=>connectionStatus('Не удалось связаться с сервером. Проверьте адрес и интернет.');
 ws.onclose=()=>{clearTimeout(timeout);if(socket!==ws)return;mode='connecting';online={host:false,guest:false};connectionStatus('Нет связи · пробуем снова','connecting');if(prefs.token&&prefs.code&&(action==='resume'||sessionAction===action&&role)){reconnectTimer=setTimeout(()=>connect('resume'),Math.min(30000,2000*2**Math.min(retry++,4)));}else{mode='offline';updateLobby();}};
}
function action(kind,value){
 if(mode==='online'&&socket?.readyState===WebSocket.OPEN){socket.send(JSON.stringify({type:'action',action:kind,value}));return;}
 if(mode==='connecting'){toast('Ожидаем подключения. Можно перейти в локальный режим.');return;}
 if(kind==='seat'){if(value==='bed'&&state[role==='host'?'guest':'host'].seat==='bed'){toast('Кровать уже занята');return;}if(state[role].seat!==value){state[role].seat=value;state[role].since=Date.now();}}
 else state[role].mood=value;
 save({offlineState:state});
}
function cat(){catUntil=performance.now()+2200;if(mode==='online')socket.send(JSON.stringify({type:'cat'}));}
function regionize(){
 spriteMask.width=sprites.width;spriteMask.height=sprites.height;sctx=spriteMask.getContext('2d',{willReadFrequently:true});sctx.drawImage(sprites,0,0);
 const cw=sprites.width/4,ch=sprites.height/2;
 for(let row=0;row<2;row++){spriteRegions[row]=[];for(let col=0;col<4;col++){
 const x=Math.round(col*cw),y=Math.round(row*ch),width=Math.floor(cw),height=Math.floor(ch);const px=sctx.getImageData(x,y,width,height).data;let x0=width,y0=height,x1=0,y1=0;
 for(let py=0;py<height;py++)for(let pxX=0;pxX<width;pxX++)if(px[(py*width+pxX)*4+3]>32){x0=Math.min(x0,pxX);x1=Math.max(x1,pxX);y0=Math.min(y0,py);y1=Math.max(y1,py);}
 spriteRegions[row][col]={x:x+x0,y:y+y0,w:x1-x0+1,h:y1-y0+1,localX:x0,localY:y0};
 }}
}
const targets={host:{sofa:{x:718,y:625,h:295,col:0},desk:{x:440,y:525,h:270,col:1},bed:{x:926,y:494,h:140,col:2},stand:{x:659,y:736,h:270,col:3}},guest:{sofa:{x:839,y:644,h:280,col:0},desk:{x:600,y:478,h:270,col:1},bed:{x:926,y:494,h:140,col:2},stand:{x:805,y:767,h:270,col:3}}};
function rounded(x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);}
function bubble(text,x,y){ctx.save();ctx.font='bold 26px Georgia';const width=ctx.measureText(text).width+26;ctx.fillStyle='#fff3d9';ctx.strokeStyle='#5b4230';ctx.lineWidth=3;rounded(x-width/2,y-38,width,43,12);ctx.fill();ctx.stroke();ctx.fillStyle='#493323';ctx.textAlign='center';ctx.fillText(text,x,y-8);ctx.restore();}
function drawExpression(p,r,d,row){if(!['sofa','stand'].includes(p.seat)||['normal','hungry'].includes(p.mood))return;
 const col=p.seat==='stand'?3:0;
 const faces=row===0?(col===0?{x:226,y:144}:{x:216,y:125}):(col===0?{x:224,y:133}:{x:217,y:116});
 const scale=d.h/r.h,fx=d.x+(faces.x-r.localX)*scale,fy=d.y+(faces.y-r.localY)*scale;
 ctx.save();ctx.translate(fx,fy);ctx.scale(scale,scale);ctx.fillStyle=row===0?'#f6bd86':'#f2ba85';ctx.beginPath();ctx.ellipse(0,0,39,24,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#483124';ctx.lineWidth=4;ctx.lineCap='round';
 for(const ex of [-17,17]){ctx.beginPath();if(p.mood==='sleepy'){ctx.moveTo(ex-6,-4);ctx.quadraticCurveTo(ex,-1,ex+6,-5);}else if(p.mood==='happy'){ctx.moveTo(ex-6,-2);ctx.quadraticCurveTo(ex,-12,ex+6,-2);}else{ctx.moveTo(ex-6,-7);ctx.lineTo(ex+6,-7);ctx.moveTo(ex,-5);ctx.lineTo(ex,-1);}ctx.stroke();}
 ctx.fillStyle='#cf895e';ctx.fillRect(-1,2,3,4);ctx.beginPath();ctx.lineWidth=2.5;if(p.mood==='happy'){ctx.moveTo(-7,10);ctx.quadraticCurveTo(0,20,8,10);}else{ctx.moveTo(-5,12);ctx.lineTo(5,12);}ctx.stroke();ctx.restore();
}
function drawAvatar(which,now){const p=state[which];if(!p)return;const row=which==='host'?0:1;const target=targets[which][p.seat]||targets[which].stand;const r=spriteRegions[row][target.col];const to={x:target.x,y:target.y,h:target.h};const pos=positions[which]||(positions[which]={...to});for(const k of ['x','y','h'])pos[k]+=(to[k]-pos[k])*.18;
 const breath=Math.sin(now/1300+row)*1.2;const d={x:pos.x,y:pos.y+breath,w:r.w/r.h*pos.h,h:pos.h};frameTargets[which]={...d,r,col:target.col};
 ctx.save();if(mode==='online'&&!online[which])ctx.globalAlpha=.48;ctx.drawImage(sprites,r.x,r.y,r.w,r.h,d.x,d.y,d.w,d.h);drawExpression(p,r,d,row);ctx.restore();
 let icon=p.mood==='hungry'?'🍔':p.mood==='tired'?'💧':p.mood==='sleepy'?'Zzz':null;if(icon)bubble(icon,d.x+d.w*.55,d.y-14+Math.sin(now/700)*3);
 if(mode==='online'&&!online[which]){ctx.save();ctx.font='16px Arial';ctx.fillStyle='#6e5b47';ctx.textAlign='center';ctx.fillText('нет в сети',d.x+d.w/2,d.y-6);ctx.restore();}
 if(which==='guest'&&p.seat==='desk'){
 const cycle=(now%6500)/6500;const x=d.x+32,y=d.y+102;
 if(cycle>.45){ctx.save();ctx.strokeStyle='#efeee5';ctx.lineWidth=5;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(x+9,y+7);ctx.lineTo(x+24,y+24);ctx.stroke();
 const progress=(cycle-.45)/.55;for(let i=0;i<3;i++){ctx.globalAlpha=(1-progress)*.5;ctx.lineWidth=2-i*.25;ctx.strokeStyle='#f8f4ec';ctx.beginPath();ctx.moveTo(x+4+i*4,y-5-progress*25);ctx.bezierCurveTo(x-15,y-25-progress*30,x+25,y-35-progress*35,x+4,y-50-progress*40);ctx.stroke();}ctx.restore();}
 }
}
function tv(on){if(!on)return;ctx.save();ctx.transform(1,.43,0,1,0,0);ctx.fillStyle='#df5142';rounded(495,575,65,38,7);ctx.fill();ctx.fillStyle='#fff5e2';ctx.beginPath();ctx.moveTo(518,582);ctx.lineTo(518,605);ctx.lineTo(540,594);ctx.closePath();ctx.fill();ctx.restore();}
let lastFrame=0;
function draw(now){if(!ready)return;if(now-lastFrame<30){requestAnimationFrame(draw);return;}lastFrame=now;ctx.clearRect(0,0,W,H);ctx.drawImage(room,0,0,W,H);
 const sorted=['host','guest'].sort((a,b)=>targets[a][state[a].seat].y-targets[b][state[b].seat].y);for(const who of sorted)drawAvatar(who,now);
 tv(Object.values(state).some(p=>p.seat==='sofa'));
 if(catUntil>now)bubble('Эу',1080,466-Math.sin(now/180)*2);
 if(hover&&!['self','cat'].includes(hover)&&!$('.panel:not([hidden])')){ctx.save();ctx.strokeStyle='#fbe5a4';ctx.lineWidth=3;ctx.setLineDash([7,7]);const h=hotspots.find(h=>h.id===hover);if(h){rounded(h.x,h.y,h.w,h.h,16);ctx.globalAlpha=.65;ctx.stroke();}ctx.restore();}
 const me=state[role];$('#timer').hidden=me.seat!=='sofa'||!$('#lobby').hidden||!$('#preferences').hidden;
 if(me.seat==='sofa'){const seconds=Math.max(0,Math.floor((Date.now()+offset-me.since)/1000));$('#timer span').textContent=[Math.floor(seconds/3600),Math.floor(seconds/60)%60,seconds%60].map(n=>String(n).padStart(2,'0')).join(':');}
 requestAnimationFrame(draw);
}
const hotspots=[{id:'cat',x:977,y:480,w:170,h:108,label:'Погладить кота'},{id:'bed',x:930,y:550,w:250,h:170,label:'Лечь на кровать'},{id:'desk',x:300,y:500,w:440,h:300,label:'Сесть за свой компьютер'},{id:'sofa',x:700,y:650,w:390,h:320,label:'Сесть на диван'},{id:'stand',x:600,y:910,w:230,h:150,label:'Встать'}];
function point(e){const b=canvas.getBoundingClientRect();return {x:(e.clientX-b.left)/b.width*W,y:(e.clientY-b.top)/b.height*H};}
function hit(p){const d=frameTargets[role];if(d&&p.x>=d.x&&p.x<d.x+d.w&&p.y>=d.y&&p.y<d.y+d.h){const sx=Math.floor(d.r.x+(p.x-d.x)/d.w*d.r.w),sy=Math.floor(d.r.y+(p.y-d.y)/d.h*d.r.h);if(sctx.getImageData(sx,sy,1,1).data[3]>40)return {id:'self',label:'Выбрать настроение'};}return hotspots.find(h=>p.x>=h.x&&p.x<=h.x+h.w&&p.y>=h.y&&p.y<=h.y+h.h);}
canvas.addEventListener('mousemove',e=>{const h=hit(point(e));hover=h?.id;canvas.style.cursor=h?'pointer':'default';$('#tip').textContent=h?.label||'';$('#tip').classList.toggle('visible',!!h);});
canvas.addEventListener('mouseleave',()=>{hover=null;$('#tip').classList.remove('visible');});
canvas.addEventListener('click',e=>{const h=hit(point(e));if(!h){dismiss();return;}if(h.id==='self'){if($('#moods').hidden){modal('#moods');$$('[data-mood]').forEach(b=>b.classList.toggle('active',b.dataset.mood===state[role].mood));}else dismiss();}else if(h.id==='cat'){dismiss();cat();}else{dismiss();action('seat',h.id);}});
document.addEventListener('mousemove',e=>{if(!desktop||!ready)return;let ignore=false;if(e.target===canvas&&!$('.panel:not([hidden])')){const p=point(e);ignore=p.x<0||p.y<0||p.x>=W||p.y>=H||mask.getImageData(Math.floor(p.x),Math.floor(p.y),1,1).data[3]<15;}if(ignore!==lastIgnore){desktop.ignore(ignore);lastIgnore=ignore;}});
$('#game').addEventListener('wheel',e=>{if(e.target.closest('.panel'))return;e.preventDefault();if(desktop)desktop.zoom(e.deltaY);else{const g=$('#game'),n=Math.max(420,Math.min(1200,g.offsetWidth+(e.deltaY<0?30:-30)));g.style.width=n+'px';g.style.height=n*.8+'px';}},{passive:false});
$('#connection').onclick=()=>{updateLobby();modal('#lobby');};$('#settings').onclick=()=>{updateLobby();modal('#preferences');};$('#close').onclick=()=>{if(desktop)desktop.close();else{stopConnection();$('#game').hidden=true;toast('Окно закрыто');}};$('#minimize').onclick=()=>desktop?desktop.minimize():toast('Сворачивание доступно в приложении Windows');
$$('[data-dismiss]').forEach(b=>b.onclick=()=>$('#'+b.dataset.dismiss).hidden=true);
$$('[data-mood]').forEach(b=>b.onclick=()=>{action('mood',b.dataset.mood);dismiss();});
$('#create-room').onclick=()=>connect('create');$('#join-room').onclick=()=>connect('join');$('#reconnect').onclick=()=>connect('resume');
$('#copy-code').onclick=async()=>{try{await navigator.clipboard.writeText(prefs.code);toast('Код комнаты скопирован');}catch{toast('Код: '+prefs.code);}};
$('#reset-guest').onclick=()=>{if($('#reset-guest').dataset.confirm!=='yes'){toast('Нажмите ещё раз, чтобы освободить место гостя');$('#reset-guest').dataset.confirm='yes';setTimeout(()=>delete $('#reset-guest').dataset.confirm,4000);return;}socket?.send(JSON.stringify({type:'resetGuest'}));delete $('#reset-guest').dataset.confirm;};
$('#offline').onclick=()=>{stopConnection();mode='offline';offset=0;role=prefs.role||'host';state=prefs.offlineState||{host:player(),guest:player()};online={host:true,guest:true};connectionStatus('Локальный режим');dismiss();updateLobby();toast('Локальный режим · подключение доступно в меню 1/2');};
$('#switch-role').onclick=()=>{role=role==='host'?'guest':'host';updateLobby();toast(role==='host'?'Управляешь девушкой':'Управляешь парнем');};
$('#save-update').onclick=async()=>{const value=$('#update-url').value.trim();try{if(value&&new URL(value).protocol!=='https:')throw Error();await save({updateUrl:value});toast('Адрес обновлений сохранён');}catch{toast('Введите HTTPS-адрес обновлений');}};
function updateStatus(m){const text={unconfigured:'Адрес обновлений пока не настроен.',development:'Обновления доступны в установленной Windows-версии.',current:'Установлена последняя версия.',available:'Доступна новая версия '+(m.version||''),progress:'Скачивание: '+m.percent+'%',ready:'Обновление скачано. Можно перезапустить игру.',error:'Ошибка обновления: '+m.message};$('#update-status').textContent=text[m.status]||'';$('#download-update').hidden=m.status!=='available';$('#install-update').hidden=m.status!=='ready';}
$('#check-update').onclick=async()=>{if(!desktop){updateStatus({status:'development'});return;}$('#update-status').textContent='Проверка…';updateStatus(await desktop.checkUpdate());};
$('#download-update').onclick=async()=>{try{$('#download-update').hidden=true;await desktop.downloadUpdate();}catch(e){updateStatus({status:'error',message:e.message});}};$('#install-update').onclick=()=>desktop?.installUpdate();desktop?.onUpdate(updateStatus);
document.addEventListener('keydown',e=>{if(e.key==='Escape')dismiss();});
async function init(){prefs=desktop?await desktop.settings():safeLoad();role=prefs.role||'host';if(prefs.offlineState)state=prefs.offlineState;$('#version').textContent=prefs.version||'0.1.0';$('#update-url').value=prefs.updateUrl||'';await Promise.all([room.decode(),sprites.decode()]);mask.drawImage(room,0,0,W,H);regionize();await new Promise(r=>setTimeout(r,2800));$('#splash').hidden=true;await desktop?.ready();$('#game').hidden=false;ready=true;updateLobby();requestAnimationFrame(draw);if(prefs.code&&prefs.token&&prefs.server)connect('resume');else modal('#lobby');if(prefs.updateUrl&&desktop){const result=await desktop.checkUpdate();if(result.status==='available'){updateStatus(result);toast('Доступно обновление · открой настройки');}}}
init().catch(e=>{$('#splash').hidden=true;$('#game').hidden=false;modal('#lobby');connectionStatus('Ошибка загрузки: '+e.message);});
