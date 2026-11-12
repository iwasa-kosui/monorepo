export type Relay = Readonly<{
  relayId: string;
  actorUri: string;
  status: string;
}>;

export type AddRelayOutcome = Readonly<{ ok: true }> | Readonly<{ ok: false; message: string }>;

export const fetchRelays = async (): Promise<readonly Relay[]> => {
  const response = await fetch('/api/iori/v1/relays');
  if (!response.ok) return [];
  const data = await response.json();
  return data.relays;
};

export const fetchRelaysOrThrow = async (): Promise<readonly Relay[]> => {
  const response = await fetch('/api/iori/v1/relays');
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  return data.relays;
};

export const addRelay = async (url: string): Promise<AddRelayOutcome> => {
  try {
    const response = await fetch('/api/iori/v1/relays', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    if (response.ok) return { ok: true };
    return {
      ok: false,
      message: response.status === 422 ? 'URL の形式が正しくありません' : 'リレーを追加できませんでした',
    };
  } catch {
    return { ok: false, message: '通信に失敗しました。もう一度お試しください' };
  }
};

export const relayHost = (relay: Relay): string => {
  try {
    return new URL(relay.actorUri).host;
  } catch {
    return relay.actorUri;
  }
};
