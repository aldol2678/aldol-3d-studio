// Structural PNG validation only; no claim of decoded visual quality.
const table=Uint32Array.from({length:256},(_,n)=>{let c=n;for(let i=0;i<8;i++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
function crc(bytes){let c=0xffffffff;for(const b of bytes)c=table[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
export function validatePng(bytes){
 const fail=()=>{throw Error('E_PNG_INVALID');};
 if(bytes.length<57||![137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v))fail();
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let at=8,first=true,idat=false,end=false,width,height;
 while(at<bytes.length){
  if(at+12>bytes.length)fail();const n=view.getUint32(at),type=String.fromCharCode(...bytes.subarray(at+4,at+8));
  if(n>bytes.length-at-12||crc(bytes.subarray(at+4,at+8+n))!==view.getUint32(at+8+n))fail();
  if(first){if(type!=='IHDR'||n!==13)fail();width=view.getUint32(at+8);height=view.getUint32(at+12);if(!width||!height||width>8192||height>8192||width*height>16777216)fail();first=false;}
  else if(type==='IHDR')fail();
  if(type==='IDAT')idat=true;
  if(type==='IEND'){if(n!==0||!idat||at+12!==bytes.length)fail();end=true;}
  at+=12+n;
 }
 if(!end)fail();return {format:'png',width,height,validation:'STRUCTURE_AND_CRC'};
}
