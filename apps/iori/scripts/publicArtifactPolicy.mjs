const forbiddenPathMessage = (path) => `${path} must not be tracked`;
const fixtureBackendExample = 'apps/iori/infra/cloudflare/example.config.s3.tfbackend';
const fixtureBackendViolationMessage = (path) => `${path} must contain fixture backend values only`;
const generatedMigrationManifest =
  /(?:^|\/)(?:export-manifest|d1-import-manifest|r2-import-manifest|ogp-import-manifest)\.json$/;

const fixtureBackendSensitiveDirective =
  /^\s*(?:[a-z0-9_]*endpoint[a-z0-9_]*|[a-z0-9_]*access_key[a-z0-9_]*|[a-z0-9_]*secret_key[a-z0-9_]*|[a-z0-9_]*(?:token|password)[a-z0-9_]*)\s*=/im;

const fixtureBackendSetting =
  /^(?:bucket\s*=\s*"iori-terraform-state-fixture"|key\s*=\s*"iori\/(?:staging|production)\/fixture1\/terraform\.tfstate"|region\s*=\s*"auto")$/;

const hasUnsafeFixtureBackendContent = (text) =>
  fixtureBackendSensitiveDirective.test(text)
  || text.split(/\r?\n/).some((line) => {
    const trimmed = line.trim();
    return trimmed.length > 0 && !trimmed.startsWith('#') && !fixtureBackendSetting.test(trimmed);
  });

const isForbiddenPath = (path) =>
  path === 'apps/iori/workers/iori/wrangler.jsonc'
  || (path.endsWith('.tfbackend') && path !== fixtureBackendExample)
  || path.endsWith('/.terraform')
  || path.includes('/.terraform/')
  || /\.tfstate(?:\..+)?$/.test(path)
  || path.includes('/migration-artifacts/')
  || path.includes('/exports/')
  || path.includes('/migration-exports/')
  || path.endsWith('.ndjson')
  || generatedMigrationManifest.test(path)
  || path.includes('/workers/iori/.generated/');

const isCloudflareConfigOrWorkflow = (path) =>
  path.startsWith('apps/iori/workers/iori/')
  || path.startsWith('apps/iori/infra/cloudflare/')
  || path.startsWith('.github/workflows/');

const isLocalFixture = (path) => path.endsWith('/wrangler.local.jsonc');

const productionBindingId =
  /(?:account_id|database_id|namespace_id|(?:preview_)?id)\s*[":=]+\s*["']?(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/i;

/**
 * Finds repository artifacts that must stay local to a deployment runner.
 *
 * @param {{ files: readonly { path: string, text: string }[] }} input
 * @returns {readonly string[]}
 */
export const findPublicArtifactViolations = ({ files }) =>
  files.flatMap(({ path, text }) => {
    if (isForbiddenPath(path)) {
      return [forbiddenPathMessage(path)];
    }

    if (path === fixtureBackendExample && hasUnsafeFixtureBackendContent(text)) {
      return [fixtureBackendViolationMessage(path)];
    }

    if (isCloudflareConfigOrWorkflow(path) && !isLocalFixture(path) && productionBindingId.test(text)) {
      return [`${path} contains a production Cloudflare binding ID`];
    }

    return [];
  });
