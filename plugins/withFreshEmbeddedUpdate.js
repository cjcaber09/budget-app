const {withAppBuildGradle}=require('expo/config-plugins');

const marker='// Budget Tracker: regenerate embedded update metadata on every release.';
const block=`\n${marker}
tasks.configureEach { task ->
    if (task.name == "createReleaseUpdatesResources") {
        task.outputs.upToDateWhen { false }
    }
}
`;
function freshEmbeddedUpdate(contents){return contents.includes(marker)?contents:contents+block;}
module.exports=config=>withAppBuildGradle(config,config=>{
  if(config.modResults.language!=='groovy')throw new Error('Embedded update freshness requires the existing Groovy Android build.');
  config.modResults.contents=freshEmbeddedUpdate(config.modResults.contents);
  return config;
});
module.exports.freshEmbeddedUpdate=freshEmbeddedUpdate;
