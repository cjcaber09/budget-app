// Reads credentials in memory; never writes/prints them. Guard the linked project.
import { loadEnvFile } from 'node:process';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
loadEnvFile();
const ref = new URL(process.env.EXPO_PUBLIC_SUPABASE_URL).hostname.split('.')[0];
if (!/^[a-z0-9]+$/.test(ref) || readFileSync('supabase/.temp/project-ref', 'utf8').trim() !== ref) throw new Error('CLI project differs from the app project; link the correct project first.');
const env = { ...process.env, SUPABASE_ACCESS_TOKEN: process.env.EXPO_SUPABASE_ACCESS_TOKEN };
if (!env.SUPABASE_ACCESS_TOKEN) throw new Error('Supabase access token is missing.');
function cli(args) {
  const result = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['supabase', ...args], { env, stdio: 'inherit', shell: process.platform === 'win32', windowsHide: true });
  if (result.status !== 0) throw new Error('Supabase command failed.');
}
if (process.argv.includes('--apply')) {
  cli(['db', 'push', '--yes']);
  cli(['functions', 'deploy', 'ocr', '--use-api', '--no-verify-jwt', '--project-ref', ref]);
  cli(['migration', 'list']);
} else {
  cli(['db', 'push', '--dry-run']);
}
