import { spawn } from 'node:child_process';
import { chmod, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const terraformRoot = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(terraformRoot, '..', '..', '..', '..');

const addressOnly = (operations) => operations.map(({ address }) => address).join('\n');

const isRepositoryPath = (path) => path === repositoryRoot || path.startsWith(`${repositoryRoot}${sep}`);

const assertExternalOutputPath = (path) => {
  if (isRepositoryPath(resolve(path))) {
    throw new Error('Import output must be outside the repository.');
  }
};

const readProtectedStdin = async () => {
  if (process.stdin.isTTY) {
    throw new Error('Protected stdin is required when --stdin is passed.');
  }
  const input = await readFile('/dev/stdin', 'utf8');
  return JSON.parse(input);
};

const identifiersFromEnvironment = () => ({
  cloudflareAccountId: process.env.CLOUDFLARE_ACCOUNT_ID,
  apiToken: process.env.CLOUDFLARE_API_TOKEN,
  d1DatabaseId: process.env.TF_IMPORT_D1_DATABASE_ID,
  r2BucketName: process.env.TF_IMPORT_R2_BUCKET_NAME,
  kvNamespaceId: process.env.TF_IMPORT_KV_NAMESPACE_ID,
  queueId: process.env.TF_IMPORT_QUEUE_ID,
});

const assertPresent = (identifiers, key) => {
  if (typeof identifiers[key] !== 'string' || identifiers[key].length === 0) {
    throw new Error(`${key} is required from the environment or protected stdin.`);
  }
};

const buildImportOperations = (identifiers, consumerId) => {
  for (const key of ['cloudflareAccountId', 'd1DatabaseId', 'r2BucketName', 'kvNamespaceId', 'queueId']) {
    assertPresent(identifiers, key);
  }

  const accountId = identifiers.cloudflareAccountId;
  const operations = [
    { address: 'cloudflare_d1_database.iori', identifier: `${accountId}/${identifiers.d1DatabaseId}` },
    { address: 'cloudflare_r2_bucket.uploads', identifier: `${accountId}/${identifiers.r2BucketName}` },
    { address: 'cloudflare_workers_kv_namespace.fedify', identifier: `${accountId}/${identifiers.kvNamespaceId}` },
    { address: 'cloudflare_queue.fedify', identifier: `${accountId}/${identifiers.queueId}` },
  ];

  if (consumerId !== undefined) {
    operations.push({
      address: 'cloudflare_queue_consumer.fedify',
      identifier: `${accountId}/${identifiers.queueId}/${consumerId}`,
    });
  }

  return operations;
};

const fetchQueueConsumerId = async (identifiers) => {
  assertPresent(identifiers, 'apiToken');
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${identifiers.cloudflareAccountId}/queues/${identifiers.queueId}/consumers`,
    { headers: { authorization: `Bearer ${identifiers.apiToken}` } },
  );
  if (!response.ok) {
    throw new Error('Unable to query the existing Queue consumer.');
  }
  const body = await response.json();
  const consumer = body.result?.[0];
  return consumer?.consumer_id ?? consumer?.id;
};

const runTerraformImport = async ({ address, identifier }) => {
  const exitCode = await new Promise((resolveExit) => {
    const child = spawn('terraform', ['import', '-input=false', address, identifier], {
      cwd: terraformRoot,
      stdio: 'ignore',
    });
    child.once('error', () => resolveExit(1));
    child.once('exit', (code) => resolveExit(code ?? 1));
  });
  if (exitCode !== 0) {
    throw new Error(`Terraform import failed for ${address}.`);
  }
};

const parseArguments = (args) => {
  const result = { execute: false, stdin: false, output: undefined };
  for (let index = 0; index < args.length; index += 1) {
    switch (args[index]) {
      case '--execute':
        result.execute = true;
        break;
      case '--stdin':
        result.stdin = true;
        break;
      case '--output':
        result.output = args[index + 1];
        index += 1;
        break;
      default:
        throw new Error('Usage: import-existing-resources.mjs [--stdin] [--execute] [--output <external-path>]');
    }
  }
  if (result.output !== undefined) {
    assertExternalOutputPath(result.output);
  }
  return result;
};

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = parseArguments(process.argv.slice(2));
  const identifiers = args.stdin ? await readProtectedStdin() : identifiersFromEnvironment();
  const consumerId = args.execute ? await fetchQueueConsumerId(identifiers) : undefined;
  const operations = buildImportOperations(identifiers, consumerId);

  if (args.execute) {
    for (const operation of operations) {
      await runTerraformImport(operation);
    }
  }

  const output = `${addressOnly(operations)}\n`;
  if (args.output === undefined) {
    process.stdout.write(output);
  } else {
    await writeFile(args.output, output, { mode: 0o600 });
    await chmod(args.output, 0o600);
  }
}
