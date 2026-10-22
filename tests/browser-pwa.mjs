import {createServer} from 'node:http';
import {readFile,stat,mkdir} from 'node:fs/promises';
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
 browser=await chromium.launch({headless:true,...(process.env.STUDIO_CHROMIUM?{executablePath:process.env.STUDIO_CHROMIUM}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
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
 await page.locator('#add-box').click();
 const canvas=page.locator('#canvas');
 await canvas.tap({position:{x:300,y:220}});
 await page.waitForFunction(()=>window.__ALDOL_PWA__.readScene().nodes.length===1);
 for(const width of [320,360,390,768]){
  await page.setViewportSize({width,height:844});
  await page.locator('#cloud-panel summary').click();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'horizontal overflow '+width);
  await page.locator('#cloud-panel summary').click();
 }
 await page.setViewportSize({width:844,height:390});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'rotation overflow');
 await page.setViewportSize({width:390,height:844});
 await mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/pwa-390.png',fullPage:true});
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
 const [download]=await Promise.all([page.waitForEvent('download',{timeout:10000}),page.evaluate(()=>window.__ALDOL_PWA__.exportBundle())]);
 assert.equal(download.suggestedFilename(),'aldol-studio-scene-assets.zip');
 assert.equal(errors.length,0,'Browser errors: '+JSON.stringify(errors));
 await page.evaluate(()=>navigator.serviceWorker.ready);
 // Simulate the transaction failing: dispatch must not retain unsaved edits.
 const rollback=await page.evaluate(async()=>{
  const before=window.__ALDOL_PWA__.snapshot();const proto=IDBObjectStore.prototype,put=proto.put;
  proto.put=function(){throw Error('QA_QUOTA_FAILURE')};
  const scene=window.__ALDOL_PWA__.readScene();
  const r=await fetch('/api/command',{method:'POST',body:JSON.stringify({operation:'node.rename',commandId:'quota-test',expectedRevision:scene.revisionToken,targetId:scene.nodes[0].id,payload:{name:'lost'}})}).then(r=>r.json());
  proto.put=put;return {r,unchanged:JSON.stringify(before)===JSON.stringify(window.__ALDOL_PWA__.snapshot())};
 });assert.equal(rollback.r.status,'rejected');assert.equal(rollback.unchanged,true);
 await context.setOffline(true);
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__ALDOL_PWA__?.readScene()?.nodes?.length===1,{timeout:15000});
 assert.equal(errors.length,0,'Offline browser errors: '+JSON.stringify(errors));
 await context.setOffline(false);
 console.log('PWA_BROWSER_PASS widths 320/360/390/768, rotation, rollback, mobile viewport, scene persistence, manifest/icons, offline reload, read-only remote exclusion');
 await context.close();
}finally{await browser?.close();await new Promise(r=>server.close(r));}
