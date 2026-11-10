import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { materializeWorkerBindings } from './materialize-worker-bindings.mjs';
import { createTemporaryWorkerConfig, workerConfigTokens } from './render-worker-config.mjs';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const templatePath = join(appRoot, 'workers/iori/wrangler.template.jsonc');
const templateDirectory = dirname(templatePath);

const requireEnv = (name) => {
  const value = process.env[name] ?? (name === 'ACCOUNT_ID' ? process.env.CLOUDFLARE_ACCOUNT_ID : undefined);
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required for iori Worker configuration.`);
  }
  return value;
};

export const stripJsonc = (source) => {
  let output = '';
  let lastCommaIndex = -1;
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];
    if (char === '"') {
      let end = index + 1;
      while (end < source.length && source[end] !== '"') end += source[end] === '\\' ? 2 : 1;
      output += source.slice(index, end + 1);
      index = end + 1;
    } else if (char === '/' && next === '/') {
      while (index < source.length && source[index] !== '\n' && source[index] !== '\r') index += 1;
    } else if (char === '/' && next === '*') {
      const close = source.indexOf('*/', index + 2);
      if (close === -1) {
        output += source.slice(index);
        break;
      }
      index = close + 2;
    } else {
      if (char === ',') lastCommaIndex = output.length;
      if ((char === '}' || char === ']') && lastCommaIndex !== -1 && output.slice(lastCommaIndex + 1).trim() === '') {
        output = output.slice(0, lastCommaIndex) + output.slice(lastCommaIndex + 1);
        lastCommaIndex = -1;
      }
      output += char;
      index += 1;
    }
  }
  return output;
};

const resolveFromTemplate = (path) => (path === undefined || isAbsolute(path) ? path : join(templateDirectory, path));

const workerBindingToken = new Map([
  ['__WORKER_NAME__', 'worker_name'],
  ['__D1_DATABASE_ID__', 'd1_database_id'],
  ['__KV_NAMESPACE_ID__', 'kv_namespace_id'],
  ['__R2_BUCKET_NAME__', 'r2_bucket_name'],
  ['__R2_EVENT_ARCHIVE_BUCKET_NAME__', 'event_archive_bucket_name'],
  ['__QUEUE_NAME__', 'queue_name'],
]);

const readTerraformWorkerBindings = async () => {
  const path = process.env.IORI_WORKER_BINDINGS_PATH;
  if (path === undefined || path.length === 0) {
    if (process.env.IORI_REQUIRE_TERRAFORM_BINDINGS === 'true') {
      throw new Error('Terraform Worker binding file is required for production deployment.');
    }
    return undefined;
  }
  try {
    const bindings = JSON.parse(await readFile(path, 'utf8'));
    return materializeWorkerBindings({
      bindings,
      expectedWorkerName: bindings.worker_name,
    });
  } catch {
    throw new Error('Terraform Worker binding file is invalid.');
  }
};

const resolveWorkerPaths = (rendered, { withoutQueueProducer }) => {
  const config = JSON.parse(stripJsonc(rendered));
  return JSON.stringify(
    {
      ...config,
      main: resolveFromTemplate(config.main),
      alias: config.alias === undefined
        ? undefined
        : Object.fromEntries(Object.entries(config.alias).map(([name, path]) => [name, resolveFromTemplate(path)])),
      assets: config.assets === undefined
        ? undefined
        : { ...config.assets, directory: resolveFromTemplate(config.assets.directory) },
      d1_databases: config.d1_databases?.map((database) => ({
        ...database,
        migrations_dir: resolveFromTemplate(database.migrations_dir),
      })),
      queues: withoutQueueProducer
        ? { ...config.queues, producers: undefined }
        : config.queues,
    },
    null,
    2,
  ) + '\n';
};

export const createDeploymentWorkerConfig = async (
  { withoutQueueProducer = false, admissionMode, admissionEnvironment } = {},
) => {
  const template = await readFile(templatePath, 'utf8');
  const bindings = await readTerraformWorkerBindings();
  const values = Object.fromEntries(workerConfigTokens.map((token) => {
    const bindingKey = workerBindingToken.get(token);
    return [
      token,
      bindingKey === undefined || bindings === undefined ? requireEnv(token.slice(2, -2)) : bindings[bindingKey],
    ];
  }));
  if (admissionEnvironment !== undefined) {
    values.__IORI_ADMISSION_IDENTITY__ = admissionEnvironment.IORI_ADMISSION_IDENTITY;
    values.__ORIGIN__ = admissionEnvironment.ORIGIN;
  }
  if (admissionMode !== undefined) values.__IORI_ADMISSION_MODE__ = admissionMode;
  return createTemporaryWorkerConfig({
    template,
    values,
    transform: (rendered) => resolveWorkerPaths(rendered, { withoutQueueProducer }),
  });
};
