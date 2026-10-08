import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {loadLinkedProject} from './supabase-project.mjs';

export function deployDatabase({deployOcr = false} = {}) {
  const project = loadLinkedProject();
  const cliPath = createRequire(import.meta.url).resolve('supabase/dist/supabase.js');
  const env = {...process.env, SUPABASE_ACCESS_TOKEN: project.accessToken};
  const commands = [['db', 'push', '--dry-run']];
  if (process.argv.includes('--apply')) {
    commands.splice(0, 1, ['db', 'push', '--yes']);
    if (deployOcr) commands.push(['functions', 'deploy', 'ocr', '--use-api', '--no-verify-jwt', '--project-ref', project.ref]);
    commands.push(['migration', 'list']);
  }
  for (const args of commands) {
    const result = spawnSync(process.execPath, [cliPath, ...args], {
      env, stdio: 'inherit', shell: false, windowsHide: true,
    });
    if (result.error || result.status !== 0) throw new Error('Supabase command failed.');
  }
}
