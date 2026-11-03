import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import {encryptedStorage} from '../../src/lib/encryptedStorage';
// Node-only fixtures; keep Node globals out of the app's TypeScript environment.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const crypto=require('node:crypto'),nodeBuffer=require('node:buffer').Buffer;
const key='budget-tracker:transaction-draft:v1:owner';
beforeEach(async()=>{await AsyncStorage.clear();await SecureStore.deleteItemAsync('budget-tracker.local-aes-key.v1');});
test('reads an existing base64 envelope through the native byte-only decrypt boundary without rewriting it',async()=>{
 const rawKey=crypto.randomBytes(32),iv=crypto.randomBytes(12),value='Saved session before the recovery update ₱42 🧾';
 const cipher=crypto.createCipheriv('aes-256-gcm',rawKey,iv);cipher.setAAD(nodeBuffer.from(key));
 const ciphertext=nodeBuffer.concat([iv,cipher.update(value,'utf8'),cipher.final(),cipher.getAuthTag()]).toString('base64');
 const envelope=JSON.stringify({__budgetEncrypted:1,ciphertext});
 await SecureStore.setItemAsync('budget-tracker.local-aes-key.v1',rawKey.toString('base64'));
 await AsyncStorage.setItem(key,envelope);
 expect(await encryptedStorage.getItem(key)).toBe(value);
 expect(await AsyncStorage.getItem(key)).toBe(envelope);
});
test('encrypts Unicode with different nonces and round-trips exact values',async()=>{
 const value='Private ₱42.50 🧾';await encryptedStorage.setItem(key,value);const first=await AsyncStorage.getItem(key);
 expect(first).not.toContain(value);expect(await encryptedStorage.getItem(key)).toBe(value);
 await encryptedStorage.setItem(key,value);expect(await AsyncStorage.getItem(key)).not.toBe(first);
});
test('migrates plaintext only after encrypted storage succeeds',async()=>{
 await AsyncStorage.setItem(key,'legacy private draft');jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('Full'));
 await expect(encryptedStorage.getItem(key)).rejects.toThrow();expect(await AsyncStorage.getItem(key)).toBe('legacy private draft');
 expect(await encryptedStorage.getItem(key)).toBe('legacy private draft');expect(await AsyncStorage.getItem(key)).not.toContain('legacy private draft');
});
test('tampering and swapping owner/key records fail authentication without deleting data',async()=>{
 await encryptedStorage.setItem(key,'Secret');const raw=(await AsyncStorage.getItem(key))!;
 await AsyncStorage.setItem('other-owner',raw);await expect(encryptedStorage.getItem('other-owner')).rejects.toThrow(/could not be unlocked/);
 const envelope=JSON.parse(raw);const bytes=nodeBuffer.from(envelope.ciphertext,'base64');bytes[15]^=1;envelope.ciphertext=bytes.toString('base64');
 await AsyncStorage.setItem(key,JSON.stringify(envelope));await expect(encryptedStorage.getItem(key)).rejects.toThrow(/could not be unlocked/);expect(await AsyncStorage.getItem(key)).not.toBeNull();
});
test('a missing key never silently replaces encrypted data or generates a replacement',async()=>{
 await encryptedStorage.setItem(key,'Secret');const raw=await AsyncStorage.getItem(key);
 await SecureStore.deleteItemAsync('budget-tracker.local-aes-key.v1');
  await expect(encryptedStorage.getItem(key)).rejects.toThrow(/could not be unlocked/);expect(await AsyncStorage.getItem(key)).toBe(raw);expect(await SecureStore.getItemAsync('budget-tracker.local-aes-key.v1')).toBeNull();
  await expect(encryptedStorage.setItem('new-key','Never replace the missing master key')).rejects.toThrow();
});
test('a legacy migration cannot overwrite a later queued edit',async()=>{
 await AsyncStorage.setItem(key,'Old');const reading=encryptedStorage.getItem(key),writing=encryptedStorage.setItem(key,'Latest');
 await Promise.all([reading,writing]);expect(await encryptedStorage.getItem(key)).toBe('Latest');
});
test('simultaneous first writes share one key without orphaning ciphertext',async()=>{
 await Promise.all([encryptedStorage.setItem('one','First'),encryptedStorage.setItem('two','Second')]);
 expect(await encryptedStorage.getItem('one')).toBe('First');expect(await encryptedStorage.getItem('two')).toBe('Second');
});
