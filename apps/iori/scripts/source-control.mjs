#!/usr/bin/env node
import { requestSourceControl } from './source-control-client.mjs';

// Raw protocol output is private data, not a public log.
requestSourceControl({ args: process.argv.slice(2), output: process.stdout }).catch((error) => {
  if (error?.notReady === true) {
    console.error('Source control is not ready.');
    process.exitCode = 75;
    return;
  }
  console.error('Source control unavailable or rejected');
  process.exitCode = 1;
});
