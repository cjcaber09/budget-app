const {freshEmbeddedUpdate}=require('../../plugins/withFreshEmbeddedUpdate');
test('native releases regenerate embedded update metadata and the prebuild fix remains idempotent',()=>{
 const original='apply plugin: "com.android.application"\n';const patched=freshEmbeddedUpdate(original);
 expect(patched).toContain('task.name == "createReleaseUpdatesResources"');expect(patched).toContain('task.outputs.upToDateWhen { false }');
 expect(freshEmbeddedUpdate(patched)).toBe(patched);expect(patched.startsWith(original)).toBe(true);
});
