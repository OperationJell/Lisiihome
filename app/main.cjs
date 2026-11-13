const { app, BrowserWindow, ipcMain, screen } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const serverMode=process.argv.includes('--server');
if(serverMode)app.setPath('userData',path.join(app.getPath('appData'),'lisii-home-server'));
let win, settings = {}, saveTimer, gameReady = false;
const configPath = () => path.join(app.getPath('userData'), 'settings.json');
function persist() { clearTimeout(saveTimer); saveTimer = setTimeout(() => { const f = configPath(); fs.mkdirSync(path.dirname(f), { recursive:true }); fs.writeFileSync(f+'.tmp', JSON.stringify(settings,null,2)); fs.renameSync(f+'.tmp',f); },200); }
function fitBounds(b) {
 const displays=screen.getAllDisplays();
 const d=displays.find(d=> b.x<d.workArea.x+d.workArea.width && b.x+b.width>d.workArea.x && b.y<d.workArea.y+d.workArea.height && b.y+b.height>d.workArea.y) || screen.getPrimaryDisplay();
 const a=d.workArea; const width=Math.min(Math.max(420,b.width||680),a.width,Math.floor(a.height/.8)); const height=Math.min(Math.round(width*.8),a.height);
 return {x:Math.round(Math.min(Math.max(b.x??a.x,a.x),a.x+a.width-width)),y:Math.round(Math.min(Math.max(b.y??a.y,a.y),a.y+a.height-height)),width:Math.round(width),height:Math.round(height)};
}
function gameBounds(){const a=screen.getPrimaryDisplay().workArea;return fitBounds(settings.bounds||{x:a.x+a.width-700,y:a.y+a.height-580,width:680,height:544});}
if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance',()=>{win?.show();win?.focus();});
app.whenReady().then(()=>{
 fs.mkdirSync(app.getPath('userData'),{recursive:true});
 if(serverMode){
  const {createRoomServer}=require('../server/index.cjs');
  const instance=createRoomServer({dataFile:path.join(app.getPath('userData'),'rooms.json')});
  const os=require('node:os');
  const ips=Object.values(os.networkInterfaces()).flat().filter(i=>i.family==='IPv4'&&!i.internal).map(i=>i.address);
  win=new BrowserWindow({width:520,height:370,title:'LISII HOME · сервер',webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
  const render=text=>win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<html lang=ru><body style="background:#f3ead6;color:#48392e;padding:30px;font:16px/1.7 Georgia"><h1>LISII HOME</h1><h3>Сервер комнаты</h3>'+text+'<p style="font-size:13px">Оставьте это окно открытым. Для игры через интернет нужен публичный сервер с HTTPS/WSS. Комнаты сохраняются автоматически.</p></body></html>'));
  instance.server.on('error',e=>render('<p>Не удалось запустить сервер: '+String(e.code||'ошибка')+'</p>'));
  instance.server.listen(8787,'0.0.0.0',()=>render('<p>Сервер запущен. Адрес для этого компьютера:<br><b>ws://localhost:8787</b></p><p>Для второго компьютера в той же сети:<br>'+ips.map(ip=>'<b>ws://'+ip+':8787</b>').join('<br>')+'</p>'));
  app.on('before-quit',()=>instance.server.close());
  return;
 }

 try {settings=JSON.parse(fs.readFileSync(configPath(),'utf8'));}catch{}
 win=new BrowserWindow({width:460,height:360,center:true,transparent:true,frame:false,resizable:false,alwaysOnTop:true,hasShadow:false,backgroundColor:'#00000000',show:false,title:'LISII HOME',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 win.setAlwaysOnTop(true,'floating');
 win.loadFile(path.join(__dirname,'index.html'));
 win.once('ready-to-show',()=>win.show());
 win.on('move',()=>{if(gameReady){settings.bounds=win.getBounds();persist();}});
 win.on('close',()=>{if(gameReady){settings.bounds=win.getBounds();}clearTimeout(saveTimer);fs.writeFileSync(configPath(),JSON.stringify(settings,null,2));});
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 win.webContents.on('will-navigate',e=>e.preventDefault());
 screen.on('display-removed',()=>{if(gameReady)win.setBounds(gameBounds());});
 screen.on('display-metrics-changed',()=>{if(gameReady)win.setBounds(fitBounds(win.getBounds()));});
});
ipcMain.handle('settings:get',()=>({...settings,version:app.getVersion()}));
ipcMain.handle('settings:save',(_,data)=>{for(const key of ['server','code','token','role','offlineState','updateUrl']) if(key in data)settings[key]=data[key];persist();return true;});
ipcMain.handle('game:ready',()=>{gameReady=true;win.setBounds(gameBounds());});
ipcMain.on('window:close',()=>win.close());
ipcMain.on('window:minimize',()=>win.minimize());
ipcMain.on('window:ignore',(_,ignore)=>win?.setIgnoreMouseEvents(Boolean(ignore),{forward:true}));
ipcMain.on('window:zoom',(_,delta)=>{if(!gameReady || !Number.isFinite(delta))return; const b=win.getBounds();const width=Math.round(Math.min(1200,Math.max(420,b.width+(delta<0?30:-30)))); const next=fitBounds({...b,x:b.x+(b.width-width)/2,y:b.y+b.height-Math.round(width*.8),width});win.setBounds(next);settings.bounds=next;persist();});
let updater;
ipcMain.handle('update:check',async()=>{
 const url=settings.updateUrl;
 if(!url)return {status:'unconfigured'};
 if(!app.isPackaged)return {status:'development'};
 try {const parsed=new URL(url);if(parsed.protocol!=='https:')throw Error('Нужен HTTPS-адрес обновлений');
 if(!updater){updater=require('electron-updater').autoUpdater;updater.autoDownload=false;updater.autoInstallOnAppQuit=false;updater.on('error',e=>win?.webContents.send('update:event',{status:'error',message:e.message}));updater.on('download-progress',p=>win?.webContents.send('update:event',{status:'progress',percent:Math.round(p.percent)}));updater.on('update-downloaded',()=>win?.webContents.send('update:event',{status:'ready'}));}
 updater.setFeedURL({provider:'generic',url});const result=await updater.checkForUpdates();return {status:result?.isUpdateAvailable?'available':'current',version:result?.updateInfo?.version};
 }catch(e){return {status:'error',message:e.message};}
});
ipcMain.handle('update:download',async()=>{if(!updater) return false; await updater.downloadUpdate();return true;});
ipcMain.on('update:install',()=>updater?.quitAndInstall(false,true));
app.on('window-all-closed',()=>app.quit());
