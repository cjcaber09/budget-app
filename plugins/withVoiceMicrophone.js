const {withAndroidManifest}=require('expo/config-plugins');

// Incremental prebuild retains a tools:node="remove" entry from old image-picker
// configuration. Adding RECORD_AUDIO alone does not undo that merge directive.
function allowVoiceMicrophone(manifest){
 const entries=manifest['uses-permission']??=[];
 let permission=entries.find(entry=>entry.$?.['android:name']==='android.permission.RECORD_AUDIO');
 if(!permission){permission={$:{'android:name':'android.permission.RECORD_AUDIO'}};entries.push(permission);}
 delete permission.$['tools:node'];
 return manifest;
}
module.exports=config=>withAndroidManifest(config,config=>{allowVoiceMicrophone(config.modResults.manifest);return config;});
module.exports.allowVoiceMicrophone=allowVoiceMicrophone;
