import type { Post, WorkspaceScenario } from './scenario';

export const scenarioProblems = (scenario: WorkspaceScenario): string[] => {
  const problems: string[] = [];
  const tabKeys = scenario.tabs.map((tab) => tab.key);
  const actorIds = new Set(Object.keys(scenario.actors));
  const channelNames = new Set(scenario.chat.channels.map((channel) => channel.name));
  const memoKeys = new Set(scenario.memo?.items.map((item) => item.key) ?? []);
  const buttons = new Set(scenario.chat.buttons.map((button) => button.name));

  if (new Set(tabKeys).size !== tabKeys.length) {
    problems.push('タブの key が重複しています');
  }
  if (!scenario.tabs.some((tab) => tab.initial !== false)) {
    problems.push('最初から表示するタブがありません');
  }
  if (scenario.tabs.some((tab) => tab.kind === 'agent') && scenario.agent === undefined) {
    problems.push('エージェントのタブがあるのに、agent がありません');
  }
  if (buttons.has('reply') && scenario.reply === undefined) {
    problems.push('「返信」のボタンがあるのに、reply がありません');
  }
  if (buttons.has('interim') && (scenario.interim === undefined || scenario.memo === undefined)) {
    problems.push('「途中経過」のボタンがあるのに、interim か memo がありません');
  }
  if (!Object.values(scenario.actors).some((actor) => actor.self === true) && buttons.size > 0) {
    problems.push('利用者の発言者（self: true）がありません');
  }

  const live = scenario.chat.live;
  if (live !== undefined && !channelNames.has(live.channel)) {
    problems.push(`chat.live のチャンネル ${live.channel} が chat.channels にありません`);
  }
  if (scenario.done === 'question:written' && live?.saveAs === undefined) {
    problems.push('done が question:written なのに、chat.live.saveAs がありません');
  }

  const checkActor = (actor: string, where: string): void => {
    if (!actorIds.has(actor)) problems.push(`${where} の発言者 ${actor} が actors にありません`);
  };
  const checkChannel = (post: Post, where: string): void => {
    if (post.channel !== undefined && !channelNames.has(post.channel)) {
      problems.push(`${where} のチャンネル ${post.channel} が chat.channels にありません`);
    }
  };
  const checkTab = (key: string, where: string, kind?: string): void => {
    const tab = scenario.tabs.find((item) => item.key === key);
    if (tab === undefined) problems.push(`${where} のタブ ${key} がありません`);
    else if (kind !== undefined && tab.kind !== kind) problems.push(`${where} のタブ ${key} は ${kind} ではありません`);
  };

  scenario.history.forEach((post, index) => {
    checkActor(post.actor, `history[${index}]`);
    checkChannel(post, `history[${index}]`);
  });
  scenario.reply?.followUps.forEach((item, index) => {
    const where = `reply.followUps[${index}]`;
    checkActor(item.actor, where);
    checkChannel(item, where);
    if (item.addTab !== undefined) checkTab(item.addTab, where);
  });

  scenario.timeline.forEach((event, index) => {
    const where = `timeline[${index}]`;
    if ((event.at === undefined) === (event.when === undefined)) {
      problems.push(`${where} は at と when のどちらか一方を持ちます`);
    }
    if (event.kind === 'post') {
      checkActor(event.post.actor, where);
      checkChannel(event.post, where);
      if (event.at !== undefined && event.delay !== undefined) {
        problems.push(`${where} は at 指定なので、delay は使われません`);
      }
      if (event.delay !== undefined && (!Number.isFinite(event.delay) || event.delay < 0)) {
        problems.push(`${where} の delay は 0 以上の有限の数にします`);
      }
    }
    if (event.kind === 'tab') checkTab(event.tab, where);
    if (event.kind === 'log' && event.tab !== undefined) checkTab(event.tab, where, 'logs');
    if (event.kind === 'sql' && event.tab !== undefined) checkTab(event.tab, where, 'console');
    if (event.kind === 'memo' && !memoKeys.has(event.memo)) {
      problems.push(`${where} の memo ${event.memo} がありません`);
    }
    if (event.kind === 'enable' && !buttons.has(event.button)) {
      problems.push(`${where} のボタン ${event.button} がありません`);
    }
  });

  scenario.agent?.steps?.forEach((step, index) => {
    if (step.kind === 'tool') checkTab(step.open, `agent.steps[${index}]`);
  });
  const decision = scenario.agent?.decision;
  if (decision !== undefined && !decision.options.some((option) => option.id === decision.adopted)) {
    problems.push(`agent.decision の adopted ${decision.adopted} が options にありません`);
  }

  return problems;
};

export const assertScenario = (scenario: WorkspaceScenario): void => {
  const problems = scenarioProblems(scenario);
  if (problems.length > 0) {
    throw new Error(`筋書き ${scenario.id} に問題があります:\n${problems.join('\n')}`);
  }
};
