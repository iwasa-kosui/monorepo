import { isDeepStrictEqual } from 'node:util';

import { validateCloudflarePlan } from './validate-cloudflare-plan.mjs';
export const validateRouteCutoverPlan = (plan, { hostname, workerName, zoneId }) => {
  const issues = validateCloudflarePlan({
    ...plan,
    operation: 'route-cutover',
    allowProductionRoute: true,
    requireWorkerBindingsNoop: true,
  });
  const changes = plan.resource_changes;
  if (!Array.isArray(changes)) return [...issues, 'Route state is required'];
  if (changes.some(item => item.change?.importing)) issues.push('Route preparation must not import resources');
  const routes = changes.filter(item =>
    item.address.startsWith('cloudflare_workers_route.') || item.address.startsWith('cloudflare_worker_route.')
  );
  const route = routes[0];
  if (
    routes.length !== 1 || route.address !== 'cloudflare_workers_route.iori[0]'
    || route.change.importing || route.change.actions.length !== 1
    || !['create', 'no-op'].includes(route.change.actions[0])
    || (route.change.actions[0] === 'no-op' && !isDeepStrictEqual(route.change.before, route.change.after))
    || route.change.after?.zone_id !== zoneId || route.change.after?.pattern !== `${hostname}/*`
    || route.change.after?.script !== workerName
    || ['zone_id', 'pattern', 'script'].some(key => route.change.after_unknown?.[key] === true)
  ) issues.push('Only the selected route may be prepared');
  for (const name of ['fedify', 'fedify_dlq']) {
    const queue = changes.find(item => item.address === `cloudflare_queue.${name}`)?.change;
    if (
      !queue || queue.actions?.length !== 1 || queue.actions[0] !== 'no-op' || queue.importing
      || queue.after?.settings?.delivery_paused !== true || !isDeepStrictEqual(queue.before, queue.after)
    ) issues.push('Queues must remain paused');
  }
  return issues;
};
