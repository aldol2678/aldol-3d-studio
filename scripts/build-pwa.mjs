import {cp,copyFile,mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {deflateSync} from 'node:zlib';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'..'),dist=join(root,'dist');
await mkdir(dist,{recursive:true});
for(const name of ['studio.css','studio.js','index.html','interaction.mjs','model-viewport.mjs','glb-contract.mjs','factory-panel.mjs'])
 await copyFile(join(root,'web',name),join(dist,name));
await cp(join(root,'compat/inha-editor'),join(dist,'compat/inha-editor'),{recursive:true});
await cp(join(root,'pwa'),join(dist,'pwa'),{recursive:true});
await copyFile(join(root,'src/command-schema.mjs'),join(dist,'command-schema.mjs'));
await mkdir(join(dist,'vendor'),{recursive:true});
await copyFile(join(root,'node_modules/playcanvas/build/playcanvas.mjs'),join(dist,'vendor/playcanvas.mjs'));
let html=await readFile(join(dist,'index.html'),'utf8');
html=html.replace('<title>ALDOL 3D Studio · P1</title>','<title>ALDOL 3D Studio · Mobile PWA</title>');
html=html.replace('<script src="/studio.js" type="module"></script>\n<script src="/factory-panel.mjs" type="module"></script>', '<script src="/pwa/bootstrap.mjs" type="module"></script>');
html=html.replace('<link rel="stylesheet" href="/studio.css" />',[
 '<link rel="stylesheet" href="/studio.css" />',
 '<link rel="stylesheet" href="/pwa/mobile.css" />',
 '<link rel="manifest" href="/manifest.webmanifest" />',
 '<link rel="icon" sizes="any" type="image/svg+xml" href="/icon.svg" />',
 '<meta name="theme-color" content="#101620" />',
 '<meta name="apple-mobile-web-app-capable" content="yes" />',
 '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />',
 '<link rel="apple-touch-icon" href="/icons/icon-192.png" />'
].join('\n'));
html=html.replace('<span class="mode" id="mode">연결 확인 중</span>', '<span class="mode" id="mode">LOCAL PWA</span><button class="pwa-assets-toggle" type="button" id="pwa-assets-toggle" aria-expanded="false" aria-controls="factory-panel-drawer">에셋</button><button class="pwa-install" type="button" id="pwa-install" hidden>＋ 설치</button>');
html=html.replace('WORLD EDITOR / P1','MOBILE / LOCAL-FIRST');
html=html.replace('v5.1 LOCAL HANDOFF','v5.1 DEVICE IMPORT');
html=html.replace('<section class="factory-panel" aria-label="Asset Factory v5.1 가져오기">','<section class="factory-panel" id="factory-panel-drawer" aria-label="Asset Factory v5.1 가져오기">');
html=html.replace('LOCAL SCENE','PWA · DEVICE-SAVED SCENE');
html=html.replace('<a class="export factory-export" href="/api/assets/package"','<a class="export factory-export" href="#"');
html=html.replace('<span>INHA WORLD</span>','<span>ALDOL PWA</span>');
html=html.replace('</header>\n<div class="workspace">','</header>\n<div class="pwa-note" role="status">기기 내부에 자동 저장됩니다. 서버 동기화는 지원하지 않습니다. 공유 기기에서는 사용에 주의하세요.</div>\n<div class="workspace">');
await writeFile(join(dist,'index.html'),html);
let studio=await readFile(join(dist,'studio.js'),'utf8');
const legacy="$('export').onclick=()=>{const a=document.createElement('a');a.href='/api/export';a.download='world.json';a.click();};";
if(!studio.includes(legacy))throw Error('E_EXPORT_PATCH_ANCHOR');
studio=studio.replace(legacy,"$('export').onclick=()=>window.__ALDOL_PWA__.downloadWorld();");
studio=studio.replace("health.mode==='demo-mock'?'DEMO · MOCK':'LEGACY · '+(health.allowWrite?'LOCAL':'READ ONLY')","health.mode==='pwa-local'?'PWA · 기기 저장':health.mode==='demo-mock'?'DEMO · MOCK':'LEGACY · '+(health.allowWrite?'LOCAL':'READ ONLY')");
studio=studio.replace("'● '+(health.mode==='demo-mock'?'모의 장면':'INHA WORLD 편집기')+' / 127.0.0.1'","health.mode==='pwa-local'?'● 기기 내부 저장 · 오프라인 가능':'● '+(health.mode==='demo-mock'?'모의 장면':'INHA WORLD 편집기')+' / 127.0.0.1'");
await writeFile(join(dist,'studio.js'),studio);
const manifest={name:'ALDOL 3D Studio',short_name:'ALDOL 3D',id:'/',start_url:'/',scope:'/',display:'standalone',
 orientation:'any',background_color:'#0d1118',theme_color:'#101620',description:'로컬 저장을 지원하는 3D 씬 편집기',
 icons:[{src:'/icons/icon-192.png',sizes:'192x192',type:'image/png',purpose:'any maskable'},
        {src:'/icons/icon-512.png',sizes:'512x512',type:'image/png',purpose:'any maskable'}]};
await writeFile(join(dist,'manifest.webmanifest'),JSON.stringify(manifest,null,2));
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="#101620"/><path d="M109 355L228 141h56l119 214h-67l-28-51H204l-28 51zM230 251h52l-26-52z" fill="#f0b85d"/><path d="M155 403h202" stroke="#86adc5" stroke-width="18" stroke-linecap="round"/></svg>';
await writeFile(join(dist,'icon.svg'),svg);
const crcTable=Uint32Array.from({length:256},(_,n)=>{let x=n;for(let i=0;i<8;i++)x=(x&1)?0xedb88320^(x>>>1):x>>>1;return x>>>0});
const crc=data=>{let x=0xffffffff;for(const byte of data)x=crcTable[(x^byte)&255]^(x>>>8);return(x^0xffffffff)>>>0;};
function chunk(type,payload){const name=Buffer.from(type),len=Buffer.alloc(4),check=Buffer.alloc(4);len.writeUInt32BE(payload.length);
check.writeUInt32BE(crc(Buffer.concat([name,payload])));return Buffer.concat([len,name,payload,check]);}
function png(size){
 const rowBytes=size*4+1,raw=Buffer.alloc(rowBytes*size);
 for(let y=0;y<size;y++){
  const off=y*rowBytes;raw[off]=0;
  for(let x=0;x<size;x++){
   const u=x/size,v=y/size;
   const a=Math.abs(u-.5),inShape=v>.265&&v<.735&&a<.32&&Math.abs(a-((v-.265)*.65))<.07;
   const bar=v>.55&&v<.6&&a<.2,under=v>.79&&v<.82&&a<.18;
   const fg=inShape||bar,c=fg?[240,184,93]:under?[134,173,197]:[16,22,32];
   const p=off+1+x*4;raw[p]=c[0];raw[p+1]=c[1];raw[p+2]=c[2];raw[p+3]=255;
  }
 }
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(size,0);ihdr.writeUInt32BE(size,4);ihdr[8]=8;ihdr[9]=6;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
await mkdir(join(dist,'icons'),{recursive:true});
for(const size of [192,512])await writeFile(join(dist,'icons','icon-'+size+'.png'),png(size));
const files=['/','/index.html','/studio.css','/studio.js','/factory-panel.mjs','/interaction.mjs','/model-viewport.mjs','/glb-contract.mjs','/vendor/playcanvas.mjs','/command-schema.mjs','/pwa/bootstrap.mjs','/pwa/browser-api.mjs','/pwa/zip.mjs','/pwa/mobile.css','/manifest.webmanifest','/icon.svg','/icons/icon-192.png','/icons/icon-512.png',
 ...['world-document.js','world-schema.js','world-serialization.js','editor-commands.js','building-mass.js','path-spline.js','map-reference.js'].map(f=>'/compat/inha-editor/'+f)];
const checksum=createHash('sha256');
for(const file of files.filter(item=>item!=='/'))checksum.update(await readFile(join(dist,file.slice(1))));
const cacheName='aldol-studio-pwa-v1-'+checksum.digest('hex').slice(0,12);
const sw=[
 'const CACHE='+JSON.stringify(cacheName)+';',
 'const PRECACHE='+JSON.stringify(files)+';',
 "self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(PRECACHE)).then(()=>self.skipWaiting())));",
 "self.addEventListener('activate',e=>e.waitUntil((async()=>{for(const k of await caches.keys())if(k.startsWith('aldol-studio-pwa-')&&k!==CACHE)await caches.delete(k);await self.clients.claim()})()));",
 "self.addEventListener('fetch',e=>{",
 "const u=new URL(e.request.url);if(u.origin!==self.location.origin||e.request.method!=='GET'||u.pathname.startsWith('/api/'))return;",
 "if(e.request.mode==='navigate'){e.respondWith(fetch(e.request).then(async r=>{if(r.ok){(await caches.open(CACHE)).put('/index.html',r.clone())}return r}).catch(async()=> (await caches.match('/index.html'))||Response.error()));return;}",
 "e.respondWith(caches.match(e.request).then(cached=>cached||fetch(e.request)));",
 "});"
].join('\n');
await writeFile(join(dist,'sw.js'),sw);
console.log('PWA dist ready:',dist,'static assets',files.length);
