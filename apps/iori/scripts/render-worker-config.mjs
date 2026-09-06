import { parseAdmission } from '../src/workerAdmission.ts';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const workerConfigTokens = [
  '__WORKER_NAME__',
  '__ACCOUNT_ID__',
  '__D1_DATABASE_ID__',
  '__KV_NAMESPACE_ID__',
  '__R2_BUCKET_NAME__',
  '__QUEUE_NAME__',
  '__ORIGIN__',
  '__IORI_ADMISSION_MODE__',
  '__IORI_ADMISSION_IDENTITY__',
  '__VAPID_SUBJECT__',
];

/**
 * @param {{ template: string, values: Record<string, string> }} input
 * @returns {string}
 */
export const renderWorkerConfig = ({ template, values }) => {
  const identity = parseAdmission({
    ORIGIN: values.__ORIGIN__,
    IORI_ADMISSION_MODE: values.__IORI_ADMISSION_MODE__,
    IORI_ADMISSION_IDENTITY: values.__IORI_ADMISSION_IDENTITY__,
  });
  if (
    !identity || identity.environment === 'local'
    || values.__WORKER_NAME__ !== `iori-${identity.environment}-${identity.generation}`
  ) throw new Error('Worker admission configuration is invalid.');
  let rendered = template;

  for (const token of workerConfigTokens) {
    const value = values[token];
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(`${token} is required to render the Worker config`);
    }
    if (/\r|\n/.test(value)) {
      throw new Error(`${token} must not contain a newline`);
    }
    if (!rendered.includes(token)) {
      throw new Error(`${token} is missing from the Worker config template`);
    }
    rendered = rendered.split(token).join(JSON.stringify(value).slice(1, -1));
  }

  const unresolvedToken = rendered.match(/__[A-Z0-9_]+__/);
  if (unresolvedToken !== null) {
    throw new Error(`${unresolvedToken[0]} is unresolved in the Worker config template`);
  }

  return rendered;
};

/**
 * @param {{ template: string, values: Record<string, string>, outputDirectory: string }} input
 * @returns {Promise<string>}
 */
export const writeWorkerConfig = async ({ template, values, outputDirectory }) => {
  const outputPath = join(outputDirectory, 'wrangler.jsonc');
  await writeFile(outputPath, renderWorkerConfig({ template, values }), { mode: 0o600 });
  await chmod(outputPath, 0o600);
  return outputPath;
};

/**
 * Creates a private temporary config. The deployment caller owns `cleanup`.
 *
 * @param {{ template: string, values: Record<string, string>, transform?: (rendered: string) => string }} input
 */
export const createTemporaryWorkerConfig = async ({ template, values, transform = (rendered) => rendered }) => {
  const outputDirectory = await mkdtemp(join(tmpdir(), 'iori-wrangler-'));
  const path = join(outputDirectory, 'wrangler.jsonc');
  await writeFile(path, transform(renderWorkerConfig({ template, values })), { mode: 0o600 });
  await chmod(path, 0o600);
  return {
    path,
    cleanup: () => rm(outputDirectory, { recursive: true, force: true }),
  };
};

const parseArguments = (args) => {
  const result = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!['--output-dir', '--template', '--values'].includes(key) || value === undefined) {
      throw new Error('Usage: render-worker-config.mjs --output-dir <directory> --template <path> --values <json>');
    }
    result[key] = value;
  }
  return result;
};

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = parseArguments(process.argv.slice(2));
  const template = await readFile(args['--template'], 'utf8');
  const outputPath = await writeWorkerConfig({
    template,
    values: JSON.parse(args['--values']),
    outputDirectory: args['--output-dir'],
  });
  console.log(outputPath);
}
