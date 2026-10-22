// No compression. Export exact Studio world.json + verified original asset bytes.
// ZIP32 only, with explicit size bounds and independent CRC-32.
const encoder=new TextEncoder(), table=Uint32Array.from({length:256},(_,n)=>{
 let c=n;for(let i=0;i<8;i++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;return c>>>0;
});
function crc32(bytes){let c=0xffffffff;for(const b of bytes)c=table[(c^b)&255]^(c>>>8);return(c^0xffffffff)>>>0;}
const write16=(v,p,n)=>{v.setUint16(p,n,true);return p+2;};
const write32=(v,p,n)=>{v.setUint32(p,n,true);return p+4;};
export function makeStoredZip(files){
 if(!Array.isArray(files)||files.length>501)throw Error('E_ZIP_ENTRIES');
 const list=files.map(item=>{
  if(typeof item.name!=='string'||!/^(?:world\.json|assets\/[a-f0-9]{64}\.(?:glb|png))$/.test(item.name)||!(item.bytes instanceof Uint8Array))throw Error('E_ZIP_ENTRY');
  const name=encoder.encode(item.name),bytes=item.bytes,crc=crc32(bytes);
  if(name.length>255||bytes.length>20*1024*1024&&!item.name.endsWith('.json'))throw Error('E_ZIP_ENTRY_SIZE');
  return {name,bytes,crc};
 });
 if(new Set(files.map(x=>x.name)).size!==files.length||!files.some(x=>x.name==='world.json'))throw Error('E_ZIP_DUP');
 const localTotal=list.reduce((s,x)=>s+30+x.name.length+x.bytes.length,0);
 const centralTotal=list.reduce((s,x)=>s+46+x.name.length,0);
 if(localTotal+centralTotal+22>85*1024*1024)throw Error('E_ZIP_LIMIT');
 const buffer=new Uint8Array(localTotal+centralTotal+22),dv=new DataView(buffer.buffer);let p=0,offsets=[];
 for(const {name,bytes,crc} of list){
  offsets.push(p);p=write32(dv,p,0x04034b50);p=write16(dv,p,20);p=write16(dv,p,0);
  p=write16(dv,p,0);p=write16(dv,p,0);p=write16(dv,p,0);
  p=write32(dv,p,crc);p=write32(dv,p,bytes.length);p=write32(dv,p,bytes.length);
  p=write16(dv,p,name.length);p=write16(dv,p,0);
  buffer.set(name,p);p+=name.length;buffer.set(bytes,p);p+=bytes.length;
 }
 const centralStart=p;
 list.forEach(({name,bytes,crc},i)=>{
  p=write32(dv,p,0x02014b50);p=write16(dv,p,20);p=write16(dv,p,20);
  p=write16(dv,p,0);p=write16(dv,p,0);p=write16(dv,p,0);p=write16(dv,p,0);
  p=write32(dv,p,crc);p=write32(dv,p,bytes.length);p=write32(dv,p,bytes.length);
  p=write16(dv,p,name.length);p=write16(dv,p,0);p=write16(dv,p,0);
  p=write16(dv,p,0);p=write16(dv,p,0);p=write32(dv,p,0);p=write32(dv,p,offsets[i]);
  buffer.set(name,p);p+=name.length;
 });
 const cdSize=p-centralStart;
 p=write32(dv,p,0x06054b50);p=write16(dv,p,0);p=write16(dv,p,0);
 p=write16(dv,p,list.length);p=write16(dv,p,list.length);
 p=write32(dv,p,cdSize);p=write32(dv,p,centralStart);p=write16(dv,p,0);
 if(p!==buffer.length)throw Error('E_ZIP_INTERNAL');
 return buffer;
}
