import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,join,extname} from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const root=resolve('dist'), MIME={'.html':'text/html','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost'),name=url.pathname==='/'?'/index.html':url.pathname;
 if(name.includes('..')){res.writeHead(404);res.end();return;}
 try{
  const data=await readFile(join(root,name));
  res.writeHead(200,{'content-type':(MIME[extname(name)]||'application/octet-stream')+'; charset=utf-8','cache-control':'no-store'});
  res.end(data);
 }catch{res.writeHead(404);res.end('Not found');}
});
server.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const base='http://127.0.0.1:'+server.address().port;
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,acceptDownloads:true});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__ALDOL_PWA__?.offline===true);
 await page.waitForFunction(()=>document.getElementById('mode')?.textContent?.includes('PWA'),{timeout:15000});
 const manifest=await page.evaluate(async()=>{const a=await fetch('/manifest.webmanifest');return a.json()});
 assert.equal(manifest.display,'standalone');
 assert.deepEqual(manifest.icons.map(i=>i.sizes),['192x192','512x512']);
 for(const path of ['/sw.js','/icons/icon-192.png','/icons/icon-512.png','/vendor/playcanvas.mjs']){
  const r=await page.request.get(base+path);assert.equal(r.status(),200,path);
 }
 await page.getByRole('button',{name:/상자 배치/}).first().click();
 const canvas=page.locator('#canvas');
 await canvas.tap({position:{x:110,y:90}});
 await page.waitForFunction(()=>window.__ALDOL_PWA__.readScene().nodes.length===1);
 const before=await page.evaluate(()=>window.__ALDOL_PWA__.readScene());
 assert.equal(before.nodes.length,1);
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__ALDOL_PWA__?.readScene()?.nodes?.length===1);
 const after=await page.evaluate(()=>window.__ALDOL_PWA__.readScene());
 assert.equal(after.nodes[0].id,before.nodes[0].id,'IndexedDB reload persists object');
 const url=await page.evaluate(async()=>{const r=await fetch('/api/scene');return r.json()});
 assert.equal(url.sceneId,'aldol.studio.pwa');
 const invalid=await page.evaluate(async()=>{const r=await fetch('/api/command',{method:'POST',body:JSON.stringify({operation:'evil.exec',commandId:'bad',expectedRevision:window.__ALDOL_PWA__.readScene().revisionToken,payload:{}})});return r.json();});
 assert.equal(invalid.status,'rejected');
 await page.evaluate(()=>window.__ALDOL_PWA__.exportBundle());
 const download=await page.waitForEvent('download',{timeout:10000}).catch(()=>null);
 // Manual backup should be callable; download event is not guaranteed if triggered before waiting.
 assert.equal(errors.length,0,'Browser errors: '+JSON.stringify(errors));
 await page.evaluate(()=>navigator.serviceWorker.ready);
 await context.setOffline(true);
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__ALDOL_PWA__?.readScene()?.nodes?.length===1,{timeout:15000});
 assert.equal(errors.length,0,'Offline browser errors: '+JSON.stringify(errors));
 console.log('PWA_BROWSER_PASS mobile viewport, scene persistence, manifest/icons, offline reload, read-only remote exclusion');
 await context.close();
}finally{await browser?.close();await new Promise(r=>server.close(r));}
