import { readFile, realpath, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const cloudflareTokenAssignment = /\b(?:CLOUDFLARE_(?:API_)?TOKEN|CF_API_TOKEN)\s*[=:]\s*\S+/i;
const vapidPrivateKeyAssignment = /\bVAPID_PRIVATE_KEY\s*[=:]\s*\S+/i;
const cloudflareUuid =
  /\b(?:cloudflare|wrangler|account[_ -]?id|database[_ -]?id|namespace[_ -]?id|queue[_ -]?id|binding)\b.*\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;
const cloudflareHexId =
  /\b(?:cloudflare|wrangler|account[_ -]?id|database[_ -]?id|namespace[_ -]?id|queue[_ -]?id|zone[_ -]?id|binding)\b.*\b[0-9a-f]{32}\b/i;
const cloudflareToken = /\b(?:cloudflare|wrangler)\b.*\b[A-Za-z0-9_-]{40,}\b/i;
const standaloneToken = /\b[A-Za-z0-9_-]{48,}\b/;
const terraformOutputCommand = /\bterraform\s+output\s+-json\b/i;
const workerBindingsPayload = /"worker_bindings"\s*:/i;
const sensitivePayload = /"sensitive"\s*:\s*true/i;
const sqlDataExport = /\b(?:INSERT\s+INTO|COPY\s+\S+\s+FROM)\b/i;

const expectedWorkerBindingKeys = new Set([
  'd1_database_id',
  'r2_bucket_name',
  'kv_namespace_id',
  'queue_name',
  'worker_name',
]);
const expectedWorkerBindingsOutputKeys = new Set(['sensitive', 'value', 'type']);
const expectedWorkerBindingsChangeKeys = new Set([
  'actions',
  'before',
  'after',
  'before_unknown',
  'after_unknown',
  'before_sensitive',
  'after_sensitive',
]);

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const hasOnlyAllowedKeys = (value, allowedKeys) =>
  isRecord(value) && Object.keys(value).every((key) => allowedKeys.has(key));

const parseJsonObject = (text) => {
  try {
    const parsed = JSON.parse(text);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
};

const isTerraformPlan = (value) =>
  value !== undefined
  && typeof value.format_version === 'string'
  && typeof value.terraform_version === 'string'
  && value.planned_values !== null
  && typeof value.planned_values === 'object'
  && isRecord(value.planned_values.root_module)
  && Array.isArray(value.resource_changes)
  && isRecord(value.output_changes)
  && isRecord(value.configuration)
  && isRecord(value.configuration.root_module)
  && !Object.hasOwn(value, 'values');

const isExpectedWorkerBindingsOutput = (value) =>
  hasOnlyAllowedKeys(value, expectedWorkerBindingsOutputKeys)
  && Object.hasOwn(value, 'sensitive')
  && Object.hasOwn(value, 'value')
  && value.sensitive === true
  && isExpectedWorkerBindingValue(value.value)
  && (!Object.hasOwn(value, 'type') || isExpectedWorkerBindingType(value.type));

const isExpectedWorkerBindingValue = (value) =>
  isRecord(value)
  && Object.keys(value).length === expectedWorkerBindingKeys.size
  && Object.keys(value).every((key) => expectedWorkerBindingKeys.has(key))
  && Object.values(value).every((binding) => typeof binding === 'string');

const isExpectedWorkerBindingType = (value) =>
  Array.isArray(value)
  && value.length === 2
  && value[0] === 'object'
  && isRecord(value[1])
  && Object.keys(value[1]).length === expectedWorkerBindingKeys.size
  && Object.keys(value[1]).every((key) => expectedWorkerBindingKeys.has(key) && value[1][key] === 'string');

const isExpectedWorkerBindingsChange = (value) =>
  hasOnlyAllowedKeys(value, expectedWorkerBindingsChangeKeys)
  && Object.hasOwn(value, 'actions')
  && Object.hasOwn(value, 'after')
  && Object.hasOwn(value, 'after_sensitive')
  && Array.isArray(value.actions)
  && value.actions.length > 0
  && value.actions.every((action) => ['create', 'delete', 'no-op', 'read', 'update'].includes(action))
  && isExpectedWorkerBindingValue(value.after)
  && value.after_sensitive === true
  && (!Object.hasOwn(value, 'after_unknown') || value.after_unknown === false)
  && (!Object.hasOwn(value, 'before') || value.before === null || isExpectedWorkerBindingValue(value.before))
  && (!Object.hasOwn(value, 'before_unknown') || value.before_unknown === false)
  && (!Object.hasOwn(value, 'before_sensitive') || typeof value.before_sensitive === 'boolean');

const isExpectedWorkerBindingsConfiguration = (value) =>
  isRecord(value)
  && Object.keys(value).length === 2
  && Object.hasOwn(value, 'sensitive')
  && Object.hasOwn(value, 'expression')
  && value.sensitive === true
  && isRecord(value.expression)
  && Object.keys(value.expression).length === 1
  && Object.hasOwn(value.expression, 'references')
  && Array.isArray(value.expression.references)
  && value.expression.references.every((reference) => typeof reference === 'string');

const hasExpectedWorkerBindingsAtAllLocations = (plan) =>
  isExpectedWorkerBindingsOutput(plan.planned_values.outputs?.worker_bindings)
  && isExpectedWorkerBindingsChange(plan.output_changes.worker_bindings)
  && isExpectedWorkerBindingsConfiguration(plan.configuration.root_module.outputs?.worker_bindings);

const hasUnexpectedSensitivePayload = (value, allowExpectedWorkerBindings, path = []) => {
  if (Array.isArray(value)) {
    return value.some((entry) => hasUnexpectedSensitivePayload(entry, allowExpectedWorkerBindings, path));
  }
  if (!isRecord(value)) return false;

  return Object.entries(value).some(([key, entry]) => {
    const entryPath = [...path, key];
    if (key === 'worker_bindings') {
      const isExpectedOutput = path.length === 2 && path[0] === 'planned_values' && path[1] === 'outputs'
        && isExpectedWorkerBindingsOutput(entry);
      const isExpectedChange = path.length === 1 && path[0] === 'output_changes'
        && isExpectedWorkerBindingsChange(entry);
      const isExpectedConfiguration = path.length === 3
        && path[0] === 'configuration'
        && path[1] === 'root_module'
        && path[2] === 'outputs'
        && isExpectedWorkerBindingsConfiguration(entry);
      return !(allowExpectedWorkerBindings && (isExpectedOutput || isExpectedChange || isExpectedConfiguration));
    }
    if (key === 'sensitive' && entry === true) return true;
    return hasUnexpectedSensitivePayload(entry, allowExpectedWorkerBindings, entryPath);
  });
};

/**
 * Returns safe category names for values that must not be emitted by a public
 * workflow. It deliberately never includes the matched value in its result.
 *
 * @param {string} text
 * @returns {readonly string[]}
 */
export const assertWorkflowOutput = (text, { allowTerraformPlan = false } = {}) => {
  const violations = new Set();
  const terraformDocument = parseJsonObject(text);
  const isTerraformPlanEnvelope = isTerraformPlan(terraformDocument);
  const isAllowedTerraformPlan = isTerraformPlanEnvelope
    && hasExpectedWorkerBindingsAtAllLocations(terraformDocument);
  const looksLikeTerraformPlan = terraformDocument !== undefined
    && (Object.hasOwn(terraformDocument, 'format_version')
      || Object.hasOwn(terraformDocument, 'planned_values')
      || Object.hasOwn(terraformDocument, 'resource_changes'));
  const hasTopLevelStateValues = terraformDocument !== undefined && Object.hasOwn(terraformDocument, 'values');
  const hasUnexpectedTerraformPayload = terraformDocument === undefined
    ? workerBindingsPayload.test(text) || sensitivePayload.test(text)
    : hasUnexpectedSensitivePayload(terraformDocument, allowTerraformPlan && isAllowedTerraformPlan);

  if (text.includes(repositoryRoot)) violations.add('absolute repository path');
  if (
    terraformOutputCommand.test(text)
    || hasTopLevelStateValues
    || hasUnexpectedTerraformPayload
    || (looksLikeTerraformPlan && !isTerraformPlanEnvelope)
  ) {
    violations.add('Terraform output payload');
  }
  if (standaloneToken.test(text)) violations.add('Cloudflare API token');

  for (const line of text.split(/\r?\n/)) {
    if (vapidPrivateKeyAssignment.test(line)) violations.add('VAPID private key');
    if (cloudflareTokenAssignment.test(line) || cloudflareToken.test(line)) violations.add('Cloudflare API token');
    if (!(allowTerraformPlan && isAllowedTerraformPlan) && (cloudflareUuid.test(line) || cloudflareHexId.test(line))) {
      violations.add('Cloudflare binding UUID');
    }
    if (sqlDataExport.test(line)) violations.add('SQL data export');
  }

  return [...violations];
};

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const privatePlanPath = process.argv[2] === '--private-terraform-plan' ? process.argv[3] : undefined;
  const output = privatePlanPath === undefined
    ? await (async () => {
      let stdin = '';
      for await (const chunk of process.stdin) stdin += chunk;
      return stdin;
    })()
    : await readFile(privatePlanPath, 'utf8');
  const privatePlanIsSafe = privatePlanPath === undefined
    ? false
    : await (async () => {
      const [path, tempDirectory, metadata] = await Promise.all([
        realpath(privatePlanPath),
        realpath(tmpdir()),
        stat(privatePlanPath),
      ]);
      return path.startsWith(`${tempDirectory}/`) && (metadata.mode & 0o077) === 0;
    })();
  const violations = privatePlanPath !== undefined && !privatePlanIsSafe
    ? ['private Terraform plan path']
    : assertWorkflowOutput(output, { allowTerraformPlan: privatePlanIsSafe });
  if (violations.length > 0) {
    console.error(`Unsafe workflow output: ${violations.join(', ')}`);
    process.exitCode = 1;
  }
}
