import { expect, it } from 'vitest';
import { validateCloudflarePlan } from '../validate-cloudflare-plan.mjs';
it('permits only pause/resume and preserves Queue settings and binding ownership', () => {
  const plan = {
    operation: 'queue-resume',
    output_changes: { worker_bindings: { actions: ['no-op'], before: {}, after: {} } },
    planned_values: { outputs: { worker_bindings: { value: {} } } },
    resource_changes: [{
      address: 'cloudflare_queue.fedify',
      change: {
        actions: ['update'],
        before: { queue_id: 'queue', settings: { delivery_paused: true, delivery_delay: 0 } },
        after: { queue_id: 'queue', settings: { delivery_paused: false, delivery_delay: 0 } },
      },
    }],
  };
  expect(validateCloudflarePlan(plan as never)).toEqual([]);
  plan.resource_changes[0]!.change.after.settings.delivery_delay = 20;
  expect(validateCloudflarePlan(plan as never)).not.toEqual([]);
});
