/** Explicit non-secret test identity. Never used by the production config renderer. */
export const admissionFixture = (hostname = 'worker.test', environment = 'production') => ({
  ORIGIN: `https://${hostname}`,
  IORI_ADMISSION_MODE: 'active',
  IORI_ADMISSION_IDENTITY: JSON.stringify({
    environment,
    generation: 'fixture1',
    mainSha: 'a'.repeat(40),
    runId: 'fixture-run',
    hostname,
    workerHostname: `iori-${environment}-fixture1.fixture.workers.dev`,
    smoke: {
      username: 'iori-smoke',
      uploadFilename: '00000000-0000-4000-8000-000000000000.png',
      articleId: '00000000-0000-4000-8000-000000000000',
    },
  }),
});
