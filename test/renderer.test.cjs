const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');const C=require('@napi-rs/canvas');
const root=path.resolve(__dirname,'../app');const html=fs.readFileSync(root+'/index.html','utf8');
const dom=new JSDOM(html,{url:'http://localhost/',runScripts:'outside-only',pretendToBeVisual:true});const w=dom.window;
const contexts=new WeakMap();w.HTMLCanvasElement.prototype.getContext=function(){if(!contexts.has(this))contexts.set(this,C.createCanvas(this.width,this.height));return contexts.get(this).getContext('2d');};
w.HTMLCanvasElement.prototype.getBoundingClientRect=function(){return {left:0,top:0,width:1000,height:800};};
class LocalImage extends C.Image{set src(value){super.src=fs.readFileSync(path.join(root,value));}get src(){return super.src;}decode(){return this.complete?Promise.resolve():new Promise((res,rej)=>{this.onload=res;this.onerror=rej;});}}
w.Image=LocalImage;let frame;w.requestAnimationFrame=f=>{frame=f;};
w.eval(fs.readFileSync(root+'/renderer.js','utf8'));
let tick=1000; function shot(name){frame(tick+=50);if(process.env.LISII_QA_DIR)fs.writeFileSync(path.join(process.env.LISII_QA_DIR,name),contexts.get(w.document.querySelector('#scene')).toBuffer('image/png'));}
function click(x,y){w.document.querySelector('#scene').dispatchEvent(new w.MouseEvent('click',{clientX:x/W*1000,clientY:y/H*800,bubbles:true}));}
const W=1402,H=1122;
(async()=>{await new Promise(r=>setTimeout(r,3200));assert.equal(w.document.querySelector('#lobby').hidden,false);w.document.querySelector('#offline').click();shot('ui-sofa.png');assert.equal(w.document.querySelector('#timer').hidden,false);
click(400,620);for(let i=0;i<40;i++)frame(tick+=40);shot('ui-desk.png');assert.equal(w.document.querySelector('#timer').hidden,true);
w.document.querySelector('#settings').click();w.document.querySelector('#switch-role').click();w.document.querySelector('[data-dismiss="preferences"]').click();click(610,560);for(let i=0;i<40;i++)frame(tick+=40);shot('ui-both-desk.png');
click(985,820);for(let i=0;i<40;i++)frame(tick+=40);shot('ui-male-sofa.png');
click(920,710);assert.equal(w.document.querySelector('#moods').hidden,false);w.document.querySelector('[data-mood="hungry"]').click();shot('ui-hungry.png');
w.document.querySelector('[data-mood="sleepy"]').click();shot('ui-sleepy.png');
click(1060,530);shot('ui-cat.png');
click(1135,630);for(let i=0;i<40;i++)frame(tick+=40);shot('ui-bed.png');assert.equal(w.document.querySelectorAll('[data-mood]').length,5);assert.match(w.localStorage.getItem('lisii-settings'),/sleepy/);console.log('Renderer: asset loading, sofa timer, desk seating, role switch, menu, hunger, sleep, cat, persistence passed.');dom.window.close();})();
