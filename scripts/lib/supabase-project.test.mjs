import {test} from 'node:test';
import assert from 'node:assert/strict';
import {queryDatabase,runSqlCheck} from './supabase-project.mjs';

const project = {ref: 'synthetic', accessToken: 'synthetic-not-a-credential'};
const expectedResult = 'PASS synthetic assertions';
const remoteText = 'REMOTE_SENTINEL\nforged log';
const query = 'select 1';

test('SQL transport uses HTTPS and does not expose remote HTTP errors', async t => {
  const fetchMock = t.mock.method(globalThis, 'fetch', () => Promise.resolve({ok: false, json: () => Promise.resolve({message: remoteText})}));
  await assert.rejects(queryDatabase(project, query), /SQL request failed/);
  const [url, options] = fetchMock.mock.calls[0].arguments;
  assert.equal(url, 'https://api.supabase.com/v1/projects/synthetic/database/query');
  assert.equal(options.body, JSON.stringify({query}));
});

test('malformed JSON cannot escape as a remote-derived error', async t => {
  t.mock.method(globalThis, 'fetch', () => Promise.resolve({ok: true, json: () => Promise.reject(new Error(remoteText))}));
  await assert.rejects(queryDatabase(project, query), {message: 'Supabase returned an unreadable SQL response.'});
});

test('successful SQL checks print a fixed local message', async t => {
  t.mock.method(globalThis, 'fetch', () => Promise.resolve({ok: true, json: () => Promise.resolve([{result: expectedResult, untrusted: remoteText}])}));
  const log = t.mock.method(console, 'log', () => {});
  await runSqlCheck(project, query, expectedResult);
  assert.deepEqual(log.mock.calls.map(call => call.arguments), [['PASS SQL checks.']]);
});

for (const scenario of ['http', 'unexpected', 'network', 'parse']) {
  test(`${scenario} failures use fixed logs and exit unsuccessfully`, async t => {
    const previousExitCode = process.exitCode;
    t.mock.method(globalThis, 'fetch', () => {
      if (scenario === 'network') return Promise.reject(new Error(remoteText));
      return Promise.resolve({ok: scenario !== 'http', json: () => scenario === 'parse'
        ? Promise.reject(new Error(remoteText)) : Promise.resolve([{result: remoteText}])});
    });
    const log = t.mock.method(console, 'error', () => {});
    try {
      await runSqlCheck(project, query, expectedResult);
      assert.equal(process.exitCode, 1);
      assert.deepEqual(log.mock.calls.map(call => call.arguments), [[
        'FAIL SQL checks. Check connectivity, configuration and database assertions; remote content was not logged.',
      ]]);
    } finally {
      process.exitCode = previousExitCode;
    }
  });
}
