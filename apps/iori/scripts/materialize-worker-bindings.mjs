import { chmod, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const bindingKeys = [
  'd1_database_id',
  'r2_bucket_name',
  'kv_namespace_id',
  'queue_name',
  'worker_name',
];

const safeBindingValue = (value) => typeof value === 'string' && value.length > 0 && !/[\r\n]/.test(value);

/**
 * Validates Terraform's sensitive worker_bindings output without exposing its values.
 *
 * @param {{ bindings: Record<string, unknown>, expectedWorkerName: string }} input
 */
export const materializeWorkerBindings = ({ bindings, expectedWorkerName }) => {
  if (
    bindings === null
    || typeof bindings !== 'object'
    || !safeBindingValue(expectedWorkerName)
    || bindingKeys.some((key) => !safeBindingValue(bindings[key]))
  ) {
    throw new Error('Terraform Worker binding output is incomplete.');
  }
  if (bindings.worker_name !== expectedWorkerName) {
    throw new Error('Terraform Worker binding output does not match the protected Worker name.');
  }
  return Object.fromEntries(bindingKeys.map((key) => [key, bindings[key]]));
};

const parseArguments = (args) => {
  const result = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!['--input', '--output', '--expected-worker-name'].includes(key) || value === undefined) {
      throw new Error(
        'Usage: materialize-worker-bindings.mjs --input <private-output.json> --output <private-bindings.json> --expected-worker-name <name>',
      );
    }
    result[key] = value;
  }
  return result;
};

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = parseArguments(process.argv.slice(2));
  let bindings;
  try {
    bindings = JSON.parse(await readFile(args['--input'], 'utf8'));
  } catch {
    throw new Error('Terraform Worker binding output could not be read.');
  }
  const materialized = materializeWorkerBindings({
    bindings,
    expectedWorkerName: args['--expected-worker-name'],
  });
  await writeFile(args['--output'], `${JSON.stringify(materialized)}\n`, { mode: 0o600 });
  await chmod(args['--output'], 0o600);
}
