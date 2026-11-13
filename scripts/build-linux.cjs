// NSIS can extract its embedded uninstaller without executing Windows code.
// Use electron-builder's own binary reader on Linux, the same path used on macOS.
const path=require('node:path');
const {WineVmManager}=require('app-builder-lib/out/vm/WineVm');
const {UninstallerReader}=require('app-builder-lib/out/targets/nsis/nsisUtil');
WineVmManager.prototype.exec=async function(file,args,options){
 if(options?.env?.__COMPAT_LAYER==='RunAsInvoker'&&file.endsWith('.exe')){
  return UninstallerReader.exec(file,path.join(path.dirname(file),`${path.basename(file,'exe')}__uninstaller.exe`));
 }
 throw Error('This build step requires Windows or Wine: '+path.basename(file));
};
require('electron-builder').build({targets:require('electron-builder').Platform.WINDOWS.createTarget(['nsis'],require('builder-util').Arch.x64),publish:'never'}).catch(e=>{console.error(e);process.exitCode=1;});
