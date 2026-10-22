// Browser-first entrypoint: all Studio scene/asset operations remain on this device.
const install=document.getElementById('pwa-install');
let promptEvent=null;
window.addEventListener('beforeinstallprompt',event=>{
 event.preventDefault();promptEvent=event;
 if(install){install.hidden=false;install.disabled=false;}
});
install?.addEventListener('click',async()=>{
 if(!promptEvent)return;
 install.disabled=true;
 await promptEvent.prompt();
 await promptEvent.userChoice;
 promptEvent=null;
 install.hidden=true;
});
window.addEventListener('appinstalled',()=>{promptEvent=null;if(install)install.hidden=true;});

const drawer=document.getElementById('pwa-assets-toggle');
drawer?.addEventListener('click',()=>{
 const expanded=drawer.getAttribute('aria-expanded')==='true';
 drawer.setAttribute('aria-expanded',String(!expanded));
 document.body.classList.toggle('pwa-asset-drawer-open',!expanded);
});
try{
 await import('/pwa/browser-api.mjs');
 await import('/studio.js');
 await import('/factory-panel.mjs');
 import('/pwa/cloud-panel.mjs').catch(()=>{});
 if('serviceWorker' in navigator){
  navigator.serviceWorker.register('/sw.js',{scope:'/'}).catch(err=>{
   console.warn('Offline installation unavailable:',err.message);
  });
 }
}catch(error){
 console.error('PWA initialization error',error);
 const status=document.getElementById('status');
 if(status)status.textContent='PWA 초기화 실패: '+error.message;
 const connection=document.getElementById('connection');
 if(connection)connection.textContent='● 브라우저 저장 공간을 확인하세요';
}
