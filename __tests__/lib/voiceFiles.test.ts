import * as FileSystem from 'expo-file-system/legacy';
import {cleanupVoiceFiles,removeVoiceFile} from '../../src/lib/voiceEntry';
jest.mock('../../src/lib/supabase',()=>({supabase:{}}));
jest.mock('expo-file-system/legacy',()=>({cacheDirectory:'file:///cache/',getInfoAsync:jest.fn(async()=>({exists:true})),readDirectoryAsync:jest.fn(async()=>['recording-1234-abcd.m4a','receipt.jpg','private.json','other.m4a']),deleteAsync:jest.fn(async()=>{})}));
beforeEach(()=>jest.clearAllMocks());
test('startup and recorder cleanup share one operation and remove only owned recording filenames',async()=>{
 await Promise.all([cleanupVoiceFiles(),cleanupVoiceFiles()]);
 expect(FileSystem.readDirectoryAsync).toHaveBeenCalledTimes(1);
 expect(FileSystem.deleteAsync).toHaveBeenCalledTimes(1);
 expect(FileSystem.deleteAsync).toHaveBeenCalledWith('file:///cache/Audio/recording-1234-abcd.m4a',{idempotent:true});
});
test('explicit recording cleanup cannot delete files outside the app cache',async()=>{
 await removeVoiceFile('file:///documents/recording-1234.m4a');await removeVoiceFile(null);expect(FileSystem.deleteAsync).not.toHaveBeenCalled();
});
