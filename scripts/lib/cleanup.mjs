// Cleanup failures must not mask the original test error or skip other fixtures.
export async function cleanupFixtures(tasks) {
  const results = await Promise.allSettled(tasks.map(task => Promise.resolve().then(task)));
  const complete = results.every(result => result.status === 'fulfilled');
  if (!complete) {
    console.error('FAIL synthetic cleanup. Some fixtures remain; remote error details were not logged.');
    process.exitCode = 1;
  }
  return complete;
}
