import { createHash, generateKeyPairSync, sign, verify } from 'node:crypto';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { executeProtectedMigration, executionReservationKey } from '../execute-protected-migration.mjs';
import { parseMigrationRehearsal } from '../migration-budget.mjs';
import { createMigrationR2Storage } from '../migration-r2-storage.mjs';
import { preparationRecordKey, rehearsalProfileKey, rehearsalTargetKey } from '../migration-target-contract.mjs';
import { rehearseProtectedMigration } from '../rehearse-protected-migration.mjs';
import { verifyRehearsalEnvelope } from '../verify-rehearsal-profile.mjs';
import { fixture, removeExecutorRoots } from './migrationExecutorFixture.js';

afterEach(async () => {
  vi.restoreAllMocks();
  await removeExecutorRoots();
});
type Fixture = Awaited<ReturnType<typeof fixture>>;
const withClock = (f: Fixture, costs: { export: number; d1: number; render: number }) => {
  let clock = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  const exportSource = f.source.export;
  f.source.export = async () => {
    clock += costs.export;
    return exportSource();
  };
  const importD1 = f.options.importD1;
  f.options.importD1 = async input => {
    clock += costs.d1;
    return importD1(input);
  };
  const render = f.options.render;
  f.options.render = async input => {
    clock += costs.render;
    return render(input);
  };
};
const rehearsalOptions = (f: Fixture) => {
  const { rehearsal: _rehearsal, ...options } = f.options;
  return options;
};
const reached = async (f: Fixture, path: string) => {
  await access(join(f.options.root, path));
};

it(
  'measures a signed profile with the specified rates, resumes the source once after export and publishes no bundle',
  async () => {
    const f = await fixture();
    const log = vi.spyOn(console, 'log');
    const error = vi.spyOn(console, 'error');
    try {
      withClock(f, { export: 4000, d1: 2000, render: 500 });
      const result = await rehearseProtectedMigration(rehearsalOptions(f));
      const target = f.options.expectedTarget;
      expect(result).toEqual({ status: 'measured', key: rehearsalProfileKey(target) });
      expect(result.key).toBe(`iori-migration/v1/production/${'a'.repeat(40)}/production-run-001/rehearsal-profile`);
      expect(f.source.resume).toHaveBeenCalledTimes(1);
      expect(f.source.resume).toHaveBeenCalledWith('destination_writes_not_enabled', expect.any(AbortSignal));
      expect(f.calls.indexOf('rehearsal-mark')).toBeLessThan(f.calls.indexOf('reserve'));
      expect(f.calls.indexOf('reserve')).toBeLessThan(f.calls.indexOf('freeze'));
      expect(f.calls.indexOf('resume')).toBeGreaterThan(f.calls.indexOf('export'));
      expect(f.calls.indexOf('resume')).toBeLessThan(f.calls.indexOf('d1'));
      await expect(access(join(f.options.root, 'contract.json'))).rejects.toThrow();
      await reached(f, 'evidence/verify-import.json');
      expect([...f.remote.keys()].sort()).toEqual([
        preparationRecordKey(target),
        rehearsalTargetKey(target),
        executionReservationKey(target),
        rehearsalProfileKey(target),
      ].sort());
      expect(JSON.parse(f.remote.get(rehearsalTargetKey(target))!.toString())).toEqual({
        schema: 'iori-migration-rehearsal-target/v1',
        main_sha: 'a'.repeat(40),
        run_id: 'production-run-001',
      });
      const text = f.remote.get(result.key)!.toString();
      const envelope = JSON.parse(text);
      expect(Object.keys(envelope)).toEqual(['schema', 'profile', 'profile_sha256', 'signature']);
      expect(envelope.schema).toBe('iori-migration-rehearsal-envelope/v1');
      expect(envelope.profile_sha256).toBe(createHash('sha256').update(envelope.profile).digest('hex'));
      expect(
        verify(
          null,
          Buffer.from(`iori-migration-rehearsal-envelope/v1\n${envelope.profile}`),
          f.options.receiptPublicKey,
          Buffer.from(envelope.signature, 'base64'),
        ),
      ).toBe(true);
      const profile = parseMigrationRehearsal(JSON.parse(envelope.profile), 'a'.repeat(40));
      expect(profile.bytes_per_second).toBeCloseTo((10008 * 3 + 240000) / 6, 6);
      expect(profile.rows_per_second).toBeCloseTo(5 * 3 / 2, 6);
      expect(profile.files_per_second).toBeCloseTo((1 * 3 + 65 * 2) / 2.5, 6);
      expect(profile.ogp_per_second).toBeCloseTo(1 / 0.5, 6);
      expect(profile.d1_capacity_bytes).toBe(10_000_000_000);
      expect(verifyRehearsalEnvelope(text, f.options.receiptPublicKey, 'a'.repeat(40))).toBe(envelope.profile);
      for (const spy of [log, error]) {
        expect(JSON.stringify(spy.mock.calls)).not.toContain('bytes_per_second');
      }
    } finally {
      f.close();
    }
  },
  30000,
);
it('floors each measured phase at one millisecond', async () => {
  const f = await fixture();
  try {
    vi.spyOn(performance, 'now').mockImplementation(() => 0);
    const result = await rehearseProtectedMigration(rehearsalOptions(f));
    const envelope = JSON.parse(f.remote.get(result.key)!.toString());
    const profile = JSON.parse(envelope.profile);
    expect(profile.rows_per_second).toBeCloseTo(15 / 0.001, 3);
    expect(profile.ogp_per_second).toBeCloseTo(1 / 0.001, 3);
  } finally {
    f.close();
  }
}, 30000);
it('resumes exactly once when a later phase fails', async () => {
  const f = await fixture();
  try {
    await expect(rehearseProtectedMigration({
      ...rehearsalOptions(f),
      importD1: async () => {
        throw new Error('d1 failed');
      },
    })).rejects.toThrow('d1 failed');
    expect(f.source.resume).toHaveBeenCalledTimes(1);
    expect(f.calls.indexOf('resume')).toBeGreaterThan(f.calls.indexOf('export'));
    expect([...f.remote.keys()]).not.toContain(rehearsalProfileKey(f.options.expectedTarget));
  } finally {
    f.close();
  }
});
it.each(['export', 'drain'] as const)('resumes the frozen source once when %s fails', async phase => {
  const f = await fixture();
  try {
    if (phase === 'export') {
      f.source.export = async () => {
        throw new Error('export failed');
      };
    } else {
      f.source.drain = async () => {
        throw new Error('drain failed');
      };
    }
    await expect(rehearseProtectedMigration(rehearsalOptions(f))).rejects.toThrow(`${phase} failed`);
    expect(f.source.resume).toHaveBeenCalledTimes(1);
    expect(f.calls).toContain('freeze');
  } finally {
    f.close();
  }
});
it('aborts the frozen section at the freeze limit, resumes once with a fresh signal and skips D1 import', async () => {
  const f = await fixture();
  try {
    let exportSignal: AbortSignal | undefined;
    let resumeSignal: AbortSignal | undefined;
    f.source.resume.mockImplementation(
      (async (_reason: string, signal: AbortSignal) => {
        resumeSignal = signal;
      }) as never,
    );
    f.source.export = (async (signal: AbortSignal) => {
      exportSignal = signal;
      return new Promise(() => {});
    }) as typeof f.source.export;
    await expect(rehearseProtectedMigration({ ...rehearsalOptions(f), freezeLimitMs: 50 })).rejects.toThrow(
      'Rehearsal freeze limit exceeded.',
    );
    expect(exportSignal?.aborted).toBe(true);
    expect(f.source.resume).toHaveBeenCalledTimes(1);
    expect(resumeSignal?.aborted).toBe(false);
    expect(f.calls).not.toContain('d1');
  } finally {
    f.close();
  }
});
it('clears the freeze limit timer once restore completes, before the later phases run', async () => {
  const f = await fixture();
  try {
    const limitMs = 123_457;
    const setTimer = vi.spyOn(globalThis, 'setTimeout');
    const clearTimer = vi.spyOn(globalThis, 'clearTimeout');
    const limitTimer = () => setTimer.mock.calls.findIndex(call => call[1] === limitMs);
    const importD1 = f.options.importD1;
    let clearedBeforeD1 = false;
    f.options.importD1 = async input => {
      const index = limitTimer();
      clearedBeforeD1 = index >= 0
        && clearTimer.mock.calls.some(call => call[0] === setTimer.mock.results[index]?.value);
      return importD1(input);
    };
    const result = await rehearseProtectedMigration({ ...rehearsalOptions(f), freezeLimitMs: limitMs });
    expect(result.status).toBe('measured');
    expect(clearedBeforeD1).toBe(true);
    expect(f.source.resume).toHaveBeenCalledTimes(1);
  } finally {
    f.close();
  }
}, 30000);
it('resumes once on abort and does not hide the original failure when resume also fails', async () => {
  const f = await fixture();
  try {
    const controller = new AbortController();
    f.source.drain = async () => {
      controller.abort(new Error('aborted'));
      throw new Error('drain aborted');
    };
    f.source.resume.mockRejectedValueOnce(new Error('resume failed'));
    const failure = await rehearseProtectedMigration({ ...rehearsalOptions(f), signal: controller.signal }).catch(
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(AggregateError);
    expect((failure as AggregateError).errors.map((e: Error) => e.message)).toEqual([
      'drain aborted',
      'resume failed',
    ]);
    expect(f.source.resume).toHaveBeenCalledTimes(1);
  } finally {
    f.close();
  }
});
it('does not retry a failed resume after export', async () => {
  const f = await fixture();
  try {
    f.source.resume.mockRejectedValueOnce(new Error('resume failed'));
    await expect(rehearseProtectedMigration(rehearsalOptions(f))).rejects.toThrow('resume failed');
    expect(f.source.resume).toHaveBeenCalledTimes(1);
  } finally {
    f.close();
  }
});
it.each(['rows', 'upload_count', 'article_count'] as const)(
  'fails before marking, reserving or freezing when %s is zero',
  async field => {
    const f = await fixture();
    try {
      f.source.estimate.mockResolvedValue({ ...await f.source.estimate(), [field]: 0 });
      await expect(rehearseProtectedMigration(rehearsalOptions(f))).rejects.toThrow('sample');
      expect(f.source.freeze).not.toHaveBeenCalled();
      expect(f.source.resume).not.toHaveBeenCalled();
      expect(f.remote.has(rehearsalTargetKey(f.options.expectedTarget))).toBe(false);
      expect(f.remote.has(executionReservationKey(f.options.expectedTarget))).toBe(false);
    } finally {
      f.close();
    }
  },
);
it('fails before reservation and freeze when the generation already carries a rehearsal mark', async () => {
  const f = await fixture();
  try {
    f.remote.set(rehearsalTargetKey(f.options.expectedTarget), Buffer.from('{}'));
    await expect(rehearseProtectedMigration(rehearsalOptions(f))).rejects.toThrow('collision');
    expect(f.source.freeze).not.toHaveBeenCalled();
    expect(f.source.resume).not.toHaveBeenCalled();
    expect(f.remote.has(executionReservationKey(f.options.expectedTarget))).toBe(false);
  } finally {
    f.close();
  }
});
it('fails without writing the rehearsal mark when the generation already has an execution reservation', async () => {
  const f = await fixture();
  try {
    const key = executionReservationKey(f.options.expectedTarget);
    f.remote.set(key, Buffer.from('{}'));
    await expect(rehearseProtectedMigration(rehearsalOptions(f))).rejects.toThrow(
      'Target generation already has an execution reservation.',
    );
    expect(f.remote.has(rehearsalTargetKey(f.options.expectedTarget))).toBe(false);
    expect(f.calls).not.toContain('rehearsal-mark');
    expect(f.source.freeze).not.toHaveBeenCalled();
    expect(f.remote.get(key)!.toString()).toBe('{}');
  } finally {
    f.close();
  }
});
it('applies the fixed D1 capacity to the capacity check only', async () => {
  const f = await fixture();
  try {
    f.source.estimate.mockResolvedValue({ ...await f.source.estimate(), table_bytes: 3_000_000_000 });
    await expect(rehearseProtectedMigration({ ...rehearsalOptions(f), availableBytes: async () => 100_000_000_000 }))
      .rejects.toThrow('D1 capacity');
    expect(f.source.freeze).not.toHaveBeenCalled();
  } finally {
    f.close();
  }
});
it('refuses data migration on a generation that was used for rehearsal, before reservation and freeze', async () => {
  const f = await fixture();
  try {
    f.remote.set(rehearsalTargetKey(f.options.expectedTarget), Buffer.from('{}'));
    await expect(executeProtectedMigration(f.options)).rejects.toThrow('Target generation was used for rehearsal.');
    expect(f.source.freeze).not.toHaveBeenCalled();
    expect(f.remote.has(executionReservationKey(f.options.expectedTarget))).toBe(false);
  } finally {
    f.close();
  }
});
it.each(['rehearse-migration', 'migrate-data'] as const)(
  'fails %s before the source estimate, mark, reservation and freeze when the uploads bucket is public',
  async operation => {
    const f = await fixture();
    try {
      f.uploadsBucket.public = true;
      const run = operation === 'migrate-data'
        ? executeProtectedMigration(f.options)
        : rehearseProtectedMigration(rehearsalOptions(f));
      await expect(run).rejects.toThrow('Migration bucket privacy preflight failed.');
      expect(f.uploadsBucket.urls).toEqual([
        `https://api.cloudflare.com/client/v4/accounts/${
          'a'.repeat(32)
        }/r2/buckets/${f.options.expectedTarget.resources.uploads.name}/domains/managed`,
        `https://api.cloudflare.com/client/v4/accounts/${
          'a'.repeat(32)
        }/r2/buckets/${f.options.expectedTarget.resources.uploads.name}/domains/custom`,
      ]);
      expect(f.source.estimate).not.toHaveBeenCalled();
      expect(f.source.freeze).not.toHaveBeenCalled();
      expect(f.source.resume).not.toHaveBeenCalled();
      expect(f.calls).toEqual([]);
      expect([...f.remote.keys()]).toEqual([preparationRecordKey(f.options.expectedTarget)]);
    } finally {
      f.close();
    }
  },
);
it.each(['rehearse-migration', 'migrate-data'] as const)(
  'proceeds to freeze in %s after one privacy check of the private uploads bucket',
  async operation => {
    const f = await fixture();
    try {
      f.source.freeze.mockRejectedValueOnce(new Error('stop at freeze'));
      const run = operation === 'migrate-data'
        ? executeProtectedMigration(f.options)
        : rehearseProtectedMigration(rehearsalOptions(f));
      await expect(run).rejects.toThrow('stop at freeze');
      expect(f.uploadsBucket.urls).toHaveLength(2);
      expect(f.uploadsBucket.urls[0]).toContain(`/r2/buckets/${f.options.expectedTarget.resources.uploads.name}/`);
      expect(f.source.freeze).toHaveBeenCalledTimes(1);
    } finally {
      f.close();
    }
  },
);
const absenceCheckedBy = (f: Fixture, error: Error) => {
  const probe = createMigrationR2Storage({
    accountId: 'a'.repeat(32),
    bucket: 'private-bucket',
    accessKeyId: 'fixture',
    secretAccessKey: 'fixture',
    createClient: () => ({
      send: async () => {
        throw error;
      },
    }),
  });
  return { ...f.options, storage: { ...f.options.storage, getIfExists: probe.getIfExists } };
};
it('proceeds to reservation and freeze when the rehearsal mark read reports 404', async () => {
  const f = await fixture();
  try {
    f.source.freeze.mockRejectedValueOnce(new Error('stop at freeze'));
    await expect(
      executeProtectedMigration(
        absenceCheckedBy(f, Object.assign(new Error('x'), { $metadata: { httpStatusCode: 404 } })),
      ),
    ).rejects.toThrow('stop at freeze');
    expect(f.source.freeze).toHaveBeenCalledTimes(1);
    expect(f.remote.has(executionReservationKey(f.options.expectedTarget))).toBe(true);
  } finally {
    f.close();
  }
});
it('fails closed without reservation or freeze when the rehearsal mark read fails for another reason', async () => {
  const f = await fixture();
  try {
    await expect(executeProtectedMigration(absenceCheckedBy(f, new Error('network')))).rejects.toThrow(
      'Migration storage read failed.',
    );
    expect(f.source.freeze).not.toHaveBeenCalled();
    expect(f.remote.has(executionReservationKey(f.options.expectedTarget))).toBe(false);
  } finally {
    f.close();
  }
});
const envelopeFixture = () => {
  const keys = generateKeyPairSync('ed25519');
  const profile = JSON.stringify(parseMigrationRehearsal({
    schema: 'iori-migration-rehearsal/v1',
    main_sha: 'a'.repeat(40),
    measured_at: '2026-09-06T00:00:00.000Z',
    bytes_per_second: 10_000_000,
    rows_per_second: 10_000,
    files_per_second: 10,
    ogp_per_second: 1,
    d1_capacity_bytes: 10_000_000_000,
  }, 'a'.repeat(40)));
  const envelope = (value: string, privateKey = keys.privateKey) => ({
    schema: 'iori-migration-rehearsal-envelope/v1',
    profile: value,
    profile_sha256: createHash('sha256').update(value).digest('hex'),
    signature: sign(null, Buffer.from(`iori-migration-rehearsal-envelope/v1\n${value}`), privateKey).toString('base64'),
  });
  return { keys, profile, envelope };
};
it('verifies an untouched rehearsal envelope and prints only the profile text', () => {
  const { keys, profile, envelope } = envelopeFixture();
  expect(verifyRehearsalEnvelope(JSON.stringify(envelope(profile)), keys.publicKey, 'a'.repeat(40))).toBe(profile);
});
it('rejects an envelope whose profile was signed directly without the prefix', () => {
  const { keys, profile, envelope } = envelopeFixture();
  const unprefixed = {
    ...envelope(profile),
    signature: sign(null, Buffer.from(profile, 'utf8'), keys.privateKey).toString('base64'),
  };
  expect(() => verifyRehearsalEnvelope(JSON.stringify(unprefixed), keys.publicKey, 'a'.repeat(40))).toThrow(
    'Rehearsal profile verification failed.',
  );
});
it('rejects tampered profiles, other keys, hash mismatches and a different main SHA with one fixed message', () => {
  const { keys, profile, envelope } = envelopeFixture();
  const good = envelope(profile);
  const tampered = profile.replace('"rows_per_second":10000', '"rows_per_second":99999');
  expect(tampered).not.toBe(profile);
  const cases = [
    [JSON.stringify({ ...good, profile: tampered }), keys.publicKey, 'a'.repeat(40)],
    [
      JSON.stringify({ ...good, profile: tampered, profile_sha256: envelope(tampered).profile_sha256 }),
      keys.publicKey,
      'a'.repeat(40),
    ],
    [JSON.stringify(good), generateKeyPairSync('ed25519').publicKey, 'a'.repeat(40)],
    [JSON.stringify(envelope(profile, generateKeyPairSync('ed25519').privateKey)), keys.publicKey, 'a'.repeat(40)],
    [JSON.stringify(good), keys.publicKey, 'b'.repeat(40)],
    [JSON.stringify({ ...good, extra: true }), keys.publicKey, 'a'.repeat(40)],
    ['not json', keys.publicKey, 'a'.repeat(40)],
  ] as const;
  for (const [text, key, sha] of cases) {
    expect(() => verifyRehearsalEnvelope(text, key, sha)).toThrow('Rehearsal profile verification failed.');
  }
});
