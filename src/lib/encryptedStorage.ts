import AsyncStorage from '@react-native-async-storage/async-storage';
import {Platform} from 'react-native';
import {sealLocal,openLocal} from './localCipher';

const queues=new Map<string,Promise<unknown>>();
const available=()=>Platform.OS!=='web'||typeof window!=='undefined';
function serial<T>(key:string,task:()=>Promise<T>):Promise<T>{
  const next=(queues.get(key)??Promise.resolve()).catch(()=>{}).then(task);queues.set(key,next);
  void next.finally(()=>{if(queues.get(key)===next)queues.delete(key);}).catch(()=>{});return next;
}
async function encrypted(key:string,value:string){return JSON.stringify({__budgetEncrypted:1,ciphertext:await sealLocal(value,key)});}
export const encryptedStorage={
  getItem:(key:string):Promise<string|null>=>serial(key,async()=>{
    if(!available())return null;
    const raw=await AsyncStorage.getItem(key);if(raw===null)return null;
    let parsed:unknown;try{parsed=JSON.parse(raw);}catch{/* Existing records may be plain strings. */}
    if(parsed&&typeof parsed==='object'&&'__budgetEncrypted' in parsed){
      const envelope=parsed as {__budgetEncrypted:unknown;ciphertext:unknown};
      if(envelope.__budgetEncrypted!==1||typeof envelope.ciphertext!=='string')throw new Error('Encrypted local data could not be read.');
      try{return await openLocal(envelope.ciphertext,key);}catch{throw new Error('Encrypted local data could not be unlocked. Retry without discarding your data.');}
    }
    // Migrate only after encryption succeeds. Failed writes leave legacy data intact.
    await AsyncStorage.setItem(key,await encrypted(key,raw));return raw;
  }),
  setItem:(key:string,value:string):Promise<void>=>serial(key,async()=>{if(available())await AsyncStorage.setItem(key,await encrypted(key,value));}),
  removeItem:(key:string):Promise<void>=>serial(key,async()=>{if(available())await AsyncStorage.removeItem(key);}),
};
