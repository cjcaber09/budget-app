// Non-extractable browser key. This protects stored bytes, not an already
// compromised browser origin or device. Native uses the OS keychain instead.
let opening:Promise<IDBDatabase>|null=null;
function database(){
  if(!globalThis.crypto?.subtle||typeof indexedDB==='undefined'){ throw new Error('Encrypted storage requires a secure browser with IndexedDB.'); }
  return opening??=(new Promise<IDBDatabase>((resolve,reject)=>{
    const request=indexedDB.open('budget-tracker-private-keys',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('keys');
    request.onerror=()=>{opening=null;reject(new Error('Could not open encrypted storage.'));};
    request.onsuccess=()=>resolve(request.result);
  }));
}
async function key(create:boolean):Promise<CryptoKey>{
  const db=await database();
  const existing=await new Promise<CryptoKey|undefined>((resolve,reject)=>{const tx=db.transaction('keys');const r=tx.objectStore('keys').get('aes-v1');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(new Error('Could not read encryption key.'));});
  if(existing){localStorage.setItem('budget-tracker:encryption-key-installed:v1','1');return existing;}
  if(!create){ throw new Error('Local encryption key is unavailable.'); }
  if(localStorage.getItem('budget-tracker:encryption-key-installed:v1')==='1'){ throw new Error('Local encryption key is unavailable.'); }
  const generated=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
  // Recheck atomically so two browser tabs cannot replace each other's key.
  return new Promise<CryptoKey>((resolve,reject)=>{
    const tx=db.transaction('keys','readwrite'),store=tx.objectStore('keys');let chosen=generated;
    const r=store.get('aes-v1');r.onsuccess=()=>{if(r.result){ chosen=r.result; }else { store.put(generated,'aes-v1'); }};
    tx.oncomplete=()=>{try{localStorage.setItem('budget-tracker:encryption-key-installed:v1','1');resolve(chosen);}catch{reject(new Error('Could not save encryption key marker.'));}};tx.onerror=tx.onabort=()=>reject(new Error('Could not save encryption key.'));
  });
}
function base64(bytes:Uint8Array){let binary='';for(const byte of bytes){ binary+=String.fromCharCode(byte); }return btoa(binary);}
export async function sealLocal(value:string,context:string):Promise<string>{
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(context),tagLength:128},await key(true),new TextEncoder().encode(value));
  const combined=new Uint8Array(12+ciphertext.byteLength);combined.set(iv);combined.set(new Uint8Array(ciphertext),12);return base64(combined);
}
export async function openLocal(ciphertext:string,context:string):Promise<string>{
  const bytes=Uint8Array.from(atob(ciphertext),c=>c.charCodeAt(0));
  if(bytes.length<28){ throw new Error('Encrypted record is incomplete.'); }
  const value=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.slice(0,12),additionalData:new TextEncoder().encode(context),tagLength:128},await key(false),bytes.slice(12));
  return new TextDecoder().decode(value);
}
