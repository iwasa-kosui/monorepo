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

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

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

const hasUnexpectedSensitivePayload = (value) => {
  if (Array.isArray(value)) return value.some((entry) => hasUnexpectedSensitivePayload(entry));
  if (!isRecord(value)) return false;

  return Object.entries(value).some(([key, entry]) => {
    if (key === 'worker_bindings') return true;
    if (key === 'sensitive' && entry === true) return true;
    return hasUnexpectedSensitivePayload(entry);
  });
};

/**
 * Returns safe category names for values that must not be emitted by a public
 * workflow. It deliberately never includes the matched value in its result.
 *
 * @param {string} text
 * @returns {readonly string[]}
 */
export const assertWorkflowOutput = (text) => {
  const violations = new Set();
  const terraformDocument = parseJsonObject(text);
  const isTerraformPlanEnvelope = isTerraformPlan(terraformDocument);
  const looksLikeTerraformPlan = terraformDocument !== undefined
    && (Object.hasOwn(terraformDocument, 'format_version')
      || Object.hasOwn(terraformDocument, 'planned_values')
      || Object.hasOwn(terraformDocument, 'resource_changes'));
  const hasTopLevelStateValues = terraformDocument !== undefined && Object.hasOwn(terraformDocument, 'values');
  const hasUnexpectedTerraformPayload = terraformDocument === undefined
    ? workerBindingsPayload.test(text) || sensitivePayload.test(text)
    : hasUnexpectedSensitivePayload(terraformDocument);

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
    if (cloudflareUuid.test(line) || cloudflareHexId.test(line)) {
      violations.add('Cloudflare binding UUID');
    }
    if (sqlDataExport.test(line)) violations.add('SQL data export');
  }

  return [...violations];
};

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  let output = '';
  for await (const chunk of process.stdin) output += chunk;
  const violations = assertWorkflowOutput(output);
  if (violations.length > 0) {
    console.error(`Unsafe workflow output: ${violations.join(', ')}`);
    process.exitCode = 1;
  }
}
