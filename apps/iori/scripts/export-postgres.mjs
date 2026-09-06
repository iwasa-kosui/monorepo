import { fileURLToPath } from 'node:url';
export { APPLICATION_TABLE_ORDER, EXPORT_LIMITS, exportPostgres } from './export-postgres-lib.mjs';

// Direct CLI booleans cannot prove quiescence. Use the fixed private source-control client.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.error('Use the private source control export operation.');
  process.exitCode = 1;
}
