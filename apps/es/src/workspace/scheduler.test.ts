import { describe, expect, it } from 'vitest';

import { createScheduler, type SchedulerStatus } from './scheduler';

const setup = (recurring: { everyMs: number }[] = []) => {
  let time = 1_000;
  const log: string[] = [];
  const statuses: SchedulerStatus[] = [];
  const ticks: boolean[] = [];
  const scheduler = createScheduler({
    now: () => time,
    recurring: recurring.map((rule) => ({
      everyMs: rule.everyMs,
      run: (index) => log.push(`beat${rule.everyMs}:${index}`),
    })),
    onStatus: (status) => statuses.push(status),
    onTick: (changed) => ticks.push(changed),
  });
  const advance = (ms: number): void => {
    time += ms;
  };
  const item = (at: number, name = `item${at}`) => ({ at, run: () => log.push(name) });
  return { scheduler, advance, item, log, statuses, ticks };
};

describe('scheduler の開始と経過時間', () => {
  it('開始前の経過時間は 0 で、開始すると 0 秒の出来事がすぐ起きる', () => {
    const { scheduler, item, log, statuses } = setup();
    expect(scheduler.status()).toBe('idle');
    expect(scheduler.elapsedMs()).toBe(0);
    scheduler.start([item(0), item(500)]);
    expect(scheduler.status()).toBe('running');
    expect(statuses).toEqual(['running']);
    expect(log).toEqual(['item0']);
  });

  it('経過時間は、現在時刻と開始時刻の差から計算する', () => {
    const { scheduler, advance } = setup();
    scheduler.start([]);
    advance(1234);
    expect(scheduler.elapsedMs()).toBe(1234);
  });

  it('時刻が来た出来事だけが、tick で時刻の昇順に起きる', () => {
    const { scheduler, advance, item, log } = setup();
    scheduler.start([item(3000), item(1000), item(2000)]);
    advance(1500);
    scheduler.tick();
    expect(log).toEqual(['item1000']);
    advance(1500);
    scheduler.tick();
    expect(log).toEqual(['item1000', 'item2000', 'item3000']);
  });

  it('同じ時刻の出来事は、登録した順に起きる', () => {
    const { scheduler, advance, item, log } = setup();
    scheduler.start([item(100, 'a'), item(100, 'b'), item(100, 'c')]);
    advance(100);
    scheduler.tick();
    expect(log).toEqual(['a', 'b', 'c']);
  });

  it('tick の最後に、その回で出来事が起きたかどうかを知らせる', () => {
    const { scheduler, advance, item, ticks } = setup();
    scheduler.start([item(1000)]);
    advance(500);
    scheduler.tick();
    advance(500);
    scheduler.tick();
    expect(ticks).toEqual([false, false, true]);
  });
});

describe('scheduler の追いつき', () => {
  it('タイマーが遅れても、戻ったときに時刻の順に追いつく', () => {
    const { scheduler, advance, item, log } = setup();
    scheduler.start([item(1000), item(5000), item(9000)]);
    advance(10_000);
    scheduler.tick();
    expect(log).toEqual(['item1000', 'item5000', 'item9000']);
  });

  it('定期の出来事は、同時刻の出来事より先に起きる', () => {
    const { scheduler, advance, item, log } = setup([{ everyMs: 4000 }]);
    scheduler.start([item(4000, 'post'), item(6000, 'late')]);
    advance(7000);
    scheduler.tick();
    expect(log).toEqual(['beat4000:1', 'post', 'late']);
  });

  it('定期の出来事は、追いつくときに回数ぶん起きる', () => {
    const { scheduler, advance, log } = setup([{ everyMs: 4000 }]);
    scheduler.start([]);
    advance(13_000);
    scheduler.tick();
    expect(log).toEqual(['beat4000:1', 'beat4000:2', 'beat4000:3']);
  });

  it('定期の出来事が複数あるときは、時刻の早い順に起きる', () => {
    const { scheduler, advance, log } = setup([{ everyMs: 3000 }, { everyMs: 2000 }]);
    scheduler.start([]);
    advance(6000);
    scheduler.tick();
    expect(log).toEqual(['beat2000:1', 'beat3000:1', 'beat2000:2', 'beat3000:2', 'beat2000:3']);
  });
});

describe('scheduler の一時停止と再開', () => {
  it('一時停止中は経過時間が止まり、出来事も起きない', () => {
    const { scheduler, advance, item, log } = setup();
    scheduler.start([item(2000)]);
    advance(1000);
    scheduler.pause();
    expect(scheduler.status()).toBe('paused');
    advance(10_000);
    scheduler.tick();
    expect(scheduler.elapsedMs()).toBe(1000);
    expect(log).toEqual([]);
  });

  it('一時停止の直前までに時刻が来た出来事は、止める前に起きる', () => {
    const { scheduler, advance, item, log } = setup();
    scheduler.start([item(500)]);
    advance(800);
    scheduler.pause();
    expect(log).toEqual(['item500']);
  });

  it('再開すると、停止していた時間を除いた続きから進む', () => {
    const { scheduler, advance, item, log } = setup();
    scheduler.start([item(2000)]);
    advance(1000);
    scheduler.pause();
    advance(60_000);
    scheduler.resume();
    expect(scheduler.status()).toBe('running');
    expect(scheduler.elapsedMs()).toBe(1000);
    advance(999);
    scheduler.tick();
    expect(log).toEqual([]);
    advance(1);
    scheduler.tick();
    expect(log).toEqual(['item2000']);
  });

  it('実行中でないときの一時停止と、停止中でないときの再開は何も起こさない', () => {
    const { scheduler, statuses } = setup();
    scheduler.pause();
    scheduler.resume();
    expect(statuses).toEqual([]);
    scheduler.start([]);
    scheduler.resume();
    expect(statuses).toEqual(['running']);
  });
});

describe('scheduler の合図', () => {
  it('合図を待つ出来事は、その合図が来たときに 1 回だけ起きる', () => {
    const { scheduler, log } = setup();
    scheduler.start([], [{ when: 'agent:requested', run: () => log.push('tab') }]);
    scheduler.signal('chat:replied');
    expect(log).toEqual([]);
    scheduler.signal('agent:requested');
    scheduler.signal('agent:requested');
    expect(log).toEqual(['tab']);
  });

  it('キーを指定した出来事は、同じキーの合図だけで起きる', () => {
    const { scheduler, log } = setup();
    scheduler.start([], [{ when: 'tab:selected', key: 'repo', run: () => log.push('repo') }]);
    scheduler.signal('tab:selected', 'logs');
    expect(log).toEqual([]);
    scheduler.signal('tab:selected', 'repo');
    expect(log).toEqual(['repo']);
  });

  it('同じ合図を待つ出来事は、登録した順にすべて起きる', () => {
    const { scheduler, log } = setup();
    scheduler.start([], [
      { when: 'workspace:started', run: () => log.push('a') },
      { when: 'workspace:started', run: () => log.push('b') },
    ]);
    scheduler.signal('workspace:started');
    expect(log).toEqual(['a', 'b']);
  });

  it('開始前と終了後の合図は受け付けず、一時停止中は受け付ける', () => {
    const { scheduler, advance, log } = setup();
    scheduler.signal('agent:requested');
    scheduler.start([], [
      { when: 'agent:requested', run: () => log.push('paused') },
      { when: 'chat:replied', run: () => log.push('ended') },
    ]);
    advance(10);
    scheduler.pause();
    scheduler.signal('agent:requested');
    expect(log).toEqual(['paused']);
    scheduler.finish(10);
    scheduler.signal('chat:replied');
    expect(log).toEqual(['paused']);
  });

  it('出来事の中から追加した時刻つきの出来事は、時刻が来たときに起きる', () => {
    const { scheduler, advance, log } = setup();
    scheduler.start([], [
      {
        when: 'chat:replied',
        run: () => scheduler.schedule([{ at: scheduler.elapsedMs() + 1500, run: () => log.push('follow-up') }]),
      },
    ]);
    advance(2000);
    scheduler.signal('chat:replied');
    advance(1499);
    scheduler.tick();
    expect(log).toEqual([]);
    advance(1);
    scheduler.tick();
    expect(log).toEqual(['follow-up']);
  });
});

describe('scheduler の終了とやり直し', () => {
  it('終了すると経過時間がその時刻で止まり、以降の tick で出来事は起きない', () => {
    const { scheduler, advance, item, log } = setup();
    scheduler.start([item(9000)]);
    advance(3000);
    scheduler.finish(2500);
    expect(scheduler.status()).toBe('ended');
    advance(20_000);
    scheduler.tick();
    expect(scheduler.elapsedMs()).toBe(2500);
    expect(log).toEqual([]);
  });

  it('出来事の中で終了すると、残りの出来事は起きない', () => {
    const { scheduler, advance, log } = setup();
    scheduler.start([
      { at: 1000, run: () => scheduler.finish(1000) },
      { at: 1000, run: () => log.push('after-finish') },
    ]);
    advance(2000);
    scheduler.tick();
    expect(scheduler.status()).toBe('ended');
    expect(log).toEqual([]);
  });

  it('やり直すと開始前に戻り、保留中の出来事は捨てられ、もう一度開始できる', () => {
    const { scheduler, advance, item, log, statuses } = setup([{ everyMs: 4000 }]);
    scheduler.start([item(5000, 'old')], [{ when: 'agent:requested', run: () => log.push('old-waiting') }]);
    advance(4500);
    scheduler.tick();
    scheduler.reset();
    expect(scheduler.status()).toBe('idle');
    expect(scheduler.elapsedMs()).toBe(0);
    expect(statuses.at(-1)).toBe('idle');
    advance(10_000);
    scheduler.tick();
    scheduler.signal('agent:requested');
    expect(log).toEqual(['beat4000:1']);
    scheduler.start([item(1000, 'new')]);
    advance(1000);
    scheduler.tick();
    expect(log).toEqual(['beat4000:1', 'new']);
    advance(3000);
    scheduler.tick();
    expect(log.at(-1)).toBe('beat4000:1');
  });

  it('開始済みのときの開始は何も起こさない', () => {
    const { scheduler, advance, item, log } = setup();
    scheduler.start([item(0, 'first')]);
    scheduler.start([item(0, 'second')]);
    advance(0);
    expect(log).toEqual(['first']);
  });
});
