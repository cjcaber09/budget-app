import {loadEnvFile} from 'node:process';
import {readFileSync} from 'node:fs';

export function loadLinkedProject() {
  loadEnvFile();
  const url = new URL(process.env.EXPO_PUBLIC_SUPABASE_URL);
  const ref = url.hostname.split('.')[0];
  if (url.protocol !== 'https:' || url.hostname !== `${ref}.supabase.co` ||
      !/^[a-z0-9]+$/.test(ref) || readFileSync('supabase/.temp/project-ref', 'utf8').trim() !== ref) {
    throw new Error('CLI project differs from the app project; link the correct project first.');
  }
  const accessToken = process.env.EXPO_SUPABASE_ACCESS_TOKEN;
  if (!accessToken) throw new Error('Supabase access token is missing.');
  return {ref, accessToken};
}

export async function queryDatabase(project, query) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${project.ref}/database/query`, {
    method: 'POST',
    headers: {Authorization: `Bearer ${project.accessToken}`, 'Content-Type': 'application/json'},
    body: JSON.stringify({query}),
    signal: AbortSignal.timeout(30000),
  });
  let rows;
  try {
    rows = await response.json();
  } catch {
    throw new Error('Supabase returned an unreadable SQL response.');
  }
  if (!response.ok || !Array.isArray(rows)) {
    // Do not propagate remote response text into errors or logs.
    throw new Error('Supabase SQL request failed or returned an invalid response.');
  }
  return rows;
}

export async function runSqlCheck(project, query, expectedResult) {
  try {
    const rows = await queryDatabase(project, query);
    if (!rows.some(row => row?.result === expectedResult)) {
      throw new Error('The expected SQL test result was missing.');
    }
    console.log('PASS SQL checks.');
  } catch {
    console.error('FAIL SQL checks. Check connectivity, configuration and database assertions; remote content was not logged.');
    process.exitCode = 1;
  }
}
