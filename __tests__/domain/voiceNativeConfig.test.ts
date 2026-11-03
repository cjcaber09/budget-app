const {allowVoiceMicrophone}=require('../../plugins/withVoiceMicrophone');
test('incremental Android prebuild removes the legacy microphone block without changing other permission policy',()=>{
 const manifest={'uses-permission':[{$:{'android:name':'android.permission.RECORD_AUDIO','tools:node':'remove'}},{$:{'android:name':'android.permission.CAMERA','tools:node':'remove'}}]};
 allowVoiceMicrophone(manifest);
 expect(manifest['uses-permission'][0].$['tools:node']).toBeUndefined();
 expect(manifest['uses-permission'][1].$['tools:node']).toBe('remove');
 allowVoiceMicrophone(manifest);expect(manifest['uses-permission']).toHaveLength(2);
});
