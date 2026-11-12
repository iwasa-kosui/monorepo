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

export const addRelay = async (url: string): Promise<AddRelayOutcome> => {
  try {
    const response = await fetch('/api/iori/v1/relays', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const data = await response.json();
    return response.ok ? { ok: true } : { ok: false, message: data.error || 'Failed to subscribe to relay' };
  } catch {
    return { ok: false, message: 'Network error. Please try again.' };
  }
};

export const relayHost = (relay: Relay): string => {
  try {
    return new URL(relay.actorUri).host;
  } catch {
    return relay.actorUri;
  }
};
