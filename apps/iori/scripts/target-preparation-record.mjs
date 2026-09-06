import {
  parseExpectedTarget,
  parsePreparationRecord,
  preparationRecordKey,
  serializePreparationRecord,
  TARGET_BYTES,
} from './migration-target-contract.mjs';
export const readPreparationRecord = async ({ storage, expectedTarget }) => {
  const target = parseExpectedTarget(expectedTarget);
  await storage.assertPrivate();
  return parsePreparationRecord(await storage.get(preparationRecordKey(target), TARGET_BYTES), target);
};
export const writePreparationRecord = async ({ storage, expectedTarget, record }) => {
  const target = parseExpectedTarget(expectedTarget);
  const body = serializePreparationRecord(record);
  const prepared = parsePreparationRecord(body, target);
  await storage.assertPrivate();
  await storage.putNew(preparationRecordKey(target), body);
  const actual = await storage.get(preparationRecordKey(target), TARGET_BYTES);
  if (!Buffer.isBuffer(actual) || !body.equals(actual)) {
    throw new Error('Preparation record readback failed; retain generation.');
  }
  return prepared;
};
