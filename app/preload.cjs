const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('desktop',{
 settings:()=>ipcRenderer.invoke('settings:get'),save:data=>ipcRenderer.invoke('settings:save',data),ready:()=>ipcRenderer.invoke('game:ready'),close:()=>ipcRenderer.send('window:close'),minimize:()=>ipcRenderer.send('window:minimize'),ignore:v=>ipcRenderer.send('window:ignore',v),zoom:delta=>ipcRenderer.send('window:zoom',delta),checkUpdate:()=>ipcRenderer.invoke('update:check'),downloadUpdate:()=>ipcRenderer.invoke('update:download'),installUpdate:()=>ipcRenderer.send('update:install'),onUpdate:cb=>ipcRenderer.on('update:event',(_,data)=>cb(data))
});
