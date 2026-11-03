import { expect, it } from 'vitest';

import { ADOPT_RESULT_WORDS, ADOPT_STAGES, adoptFailureLines, adoptResultLine } from '../adopt-diagnostics.mjs';
import { ADOPT_ATTRIBUTE_WORDS } from '../adopt-plan.mjs';
import { assertWorkflowOutput } from '../assert-workflow-output.mjs';

const publicLine =
  /^IORI_DIAG stage=[a-z-]{1,24} program=(?:ssh|rsync|terraform|node|none) exit=(?:\d{1,3}|none) signal=(?:[A-Z0-9]{1,12}|none) reason=[a-z0-9-]{1,40}$/;
const adoptLine = (stage: string, reason: string) =>
  `IORI_DIAG stage=${stage} program=none exit=none signal=none reason=${reason}`;
const failure = (reason?: string, details?: unknown, message = 'fixture-secret-message') =>
  Object.assign(new Error(message), {
    diagnostic: { ...(reason === undefined ? {} : { reason }), ...(details === undefined ? {} : { details }) },
  });
const expectPublic = (line: string) => {
  expect(line).toMatch(publicLine);
  expect(assertWorkflowOutput(line)).toEqual([]);
};
it('pins the adoption stage vocabulary within the public stage pattern', () => {
  expect(ADOPT_STAGES).toEqual([
    'adopt-inputs',
    'adopt-main-check',
    'adopt-tf-init',
    'adopt-state-read',
    'adopt-cloud-read',
    'adopt-route-import',
    'adopt-refresh-plan',
    'adopt-refresh-apply',
    'adopt-final-plan',
    'adopt-final-check',
    'adopt-cloud-reread',
  ]);
  expect(Object.isFrozen(ADOPT_STAGES)).toBe(true);
  for (const stage of ADOPT_STAGES) expect(stage).toMatch(/^[a-z-]{1,24}$/);
  expect(Object.isFrozen(ADOPT_RESULT_WORDS)).toBe(true);
});
it.each(
  [
    'state-mismatch',
    'worker-route',
    'route-id-invalid',
    'plan-rejected',
    'plan-bindings-changed',
    'output-mismatch',
    'output-invalid',
    'command-failed',
    'config-invalid',
    'mismatch',
    'reviewed-main-changed',
    'aborted',
  ],
)('keeps the failure line of every stage within the public pattern for reason %s', (reason) => {
  for (const stage of [...ADOPT_STAGES, 'unclassified']) {
    const [line] = adoptFailureLines(stage, failure(reason), false);
    expect(line).toBe(adoptLine(stage, reason));
    expectPublic(line!);
  }
});
it('keeps every success line of the vocabulary within the public pattern and the workflow output check', () => {
  const lines = Object.entries(ADOPT_RESULT_WORDS).flatMap(([stage, words]) =>
    words.map((word) => [stage, word, adoptResultLine(stage, word)] as const)
  );
  expect(lines.map(([, word]) => word)).toEqual([
    'route-imported',
    'route-in-state',
    'refresh-no-drift',
    'refresh-drift-allowed',
    'refresh-applied',
    'plan-clean',
    'adopted',
  ]);
  for (const [stage, word, line] of lines) {
    expect(line).toBe(adoptLine(stage, word));
    expectPublic(line);
  }
});
it('prints a result word only for the stage that owns it', () => {
  expect(adoptResultLine('adopt-cloud-reread', 'plan-clean')).toBe(adoptLine('adopt-cloud-reread', 'unclassified'));
  expect(adoptResultLine('adopt-inputs', 'adopted')).toBe(adoptLine('adopt-inputs', 'unclassified'));
  for (const stage of ['unknown', undefined, 'prepare-inputs', 'constructor', '__proto__']) {
    expect(adoptResultLine(stage, 'adopted')).toBe(adoptLine('unclassified', 'unclassified'));
  }
  expect(adoptResultLine('adopt-cloud-reread', 'https://secret.invalid')).toBe(
    adoptLine('adopt-cloud-reread', 'unclassified'),
  );
});
it('prints the plan words and every attribute word before the classification', () => {
  const details = [
    'plan-queue-update',
    'plan-invalid',
    'drift-queue-delivery-paused',
    'drift-queue-modified-on',
    'diff-consumer-script-name',
    'diff-route-pattern',
  ];
  const lines = adoptFailureLines('adopt-refresh-plan', failure('plan-rejected', details), false);
  expect(lines).toEqual([...details, 'plan-rejected'].map((reason) => adoptLine('adopt-refresh-plan', reason)));
  for (const line of lines) expectPublic(line);
});
it('prints every attribute word of every resource as a public line', () => {
  const details = Object.entries(ADOPT_ATTRIBUTE_WORDS).flatMap(([resource, words]) =>
    ['drift', 'diff'].flatMap((prefix) => words.map((word) => `${prefix}-${resource}-${word}`))
  );
  const lines = adoptFailureLines('adopt-final-plan', failure('plan-rejected', details), false);
  expect(lines).toHaveLength(25);
  const detailsOnly = details.map((detail) => adoptLine('adopt-final-plan', detail));
  for (const detail of detailsOnly) expectPublic(detail);
});
it('removes duplicates, drops words outside the vocabulary and keeps the secret message out', () => {
  const lines = adoptFailureLines(
    'adopt-final-plan',
    failure('plan-rejected', [
      'drift-queue-delivery-paused',
      'drift-queue-delivery-paused',
      'drift-queue-secret-value',
      'drift-queue-Delivery-Paused',
      'diff-nothing-other',
      'https://secret.invalid',
      7,
      null,
    ]),
    false,
  );
  expect(lines).toEqual([
    adoptLine('adopt-final-plan', 'drift-queue-delivery-paused'),
    adoptLine('adopt-final-plan', 'plan-rejected'),
  ]);
  expect(lines.join('\n')).not.toContain('fixture-secret-message');
  expect(adoptFailureLines('adopt-final-plan', failure('plan-rejected', 'drift-queue-other'), false)).toEqual([
    adoptLine('adopt-final-plan', 'plan-rejected'),
  ]);
});
it('classifies by reason, then abort, then the known message, then unclassified', () => {
  expect(adoptFailureLines('adopt-cloud-read', failure('https://secret.invalid'), false)).toEqual([
    adoptLine('adopt-cloud-read', 'unclassified'),
  ]);
  expect(adoptFailureLines('adopt-cloud-read', failure(), true)).toEqual([adoptLine('adopt-cloud-read', 'aborted')]);
  expect(adoptFailureLines('adopt-cloud-read', Object.assign(new Error('x'), { name: 'TimeoutError' }), false))
    .toEqual([adoptLine('adopt-cloud-read', 'aborted')]);
  expect(adoptFailureLines('adopt-inputs', new Error('Protected workflow invocation is invalid.'), false)).toEqual([
    adoptLine('adopt-inputs', 'config-invalid'),
  ]);
  expect(adoptFailureLines('adopt-inputs', undefined, false)).toEqual([adoptLine('adopt-inputs', 'unclassified')]);
});
it('uses stage=unclassified for a stage outside the vocabulary', () => {
  for (const stage of ['unknown', undefined, 'prepare-inputs', 'deploy-worker-before', 'https://secret.invalid']) {
    expect(adoptFailureLines(stage, failure('mismatch'), false)).toEqual([adoptLine('unclassified', 'mismatch')]);
  }
});
