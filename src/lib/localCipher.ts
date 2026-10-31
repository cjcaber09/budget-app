import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {AESEncryptionKey,AESKeySize,AESSealedData,aesEncryptAsync,aesDecryptAsync} from 'expo-crypto';

const keyName='budget-tracker.local-aes-key.v1';
const marker='budget-tracker:encryption-key-installed:v1';
const options={keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY};
let keyWork:Promise<unknown>=Promise.resolve();
async function keyTask(create:boolean):Promise<AESEncryptionKey>{
  const stored=await SecureStore.getItemAsync(keyName,options);
  if(stored){if(await AsyncStorage.getItem(marker)!=='1')await AsyncStorage.setItem(marker,'1');return AESEncryptionKey.import(stored,'base64');}
  if(!create)throw new Error('Local encryption key is unavailable.');
  if(await AsyncStorage.getItem(marker)==='1')throw new Error('Local encryption key is unavailable.');
  const generated=await AESEncryptionKey.generate(AESKeySize.AES256);
  await SecureStore.setItemAsync(keyName,await generated.encoded('base64'),options);
  await AsyncStorage.setItem(marker,'1');
  return generated;
}
function key(create:boolean):Promise<AESEncryptionKey>{const next=keyWork.catch(()=>{}).then(()=>keyTask(create));keyWork=next;return next;}
export async function sealLocal(value:string,context:string):Promise<string>{
  const sealed=await aesEncryptAsync(new TextEncoder().encode(value),await key(true),{additionalData:new TextEncoder().encode(context),nonce:{length:12},tagLength:16});
  return sealed.combined('base64');
}
export async function openLocal(ciphertext:string,context:string):Promise<string>{
  // Android's native fromCombined expects bytes despite the SDK accepting strings.
  // Keep the stored base64 format and decode before crossing the native boundary.
  const bytes=Uint8Array.from(atob(ciphertext),character=>character.charCodeAt(0));
  const value=await aesDecryptAsync(AESSealedData.fromCombined(bytes),await key(false),{additionalData:new TextEncoder().encode(context)});
  return new TextDecoder().decode(value);
}
