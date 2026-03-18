export interface Client {
  get<T>(path: string, params?: Record<string, string>): Promise<T>;
  postJson<T>(path: string, body: unknown): Promise<T>;
  del<T>(path: string, body?: unknown): Promise<T>;
  getResponse(path: string, init?: RequestInit): Promise<Response>;
}

export function createClient(baseUrl: string, sessionId?: string): Client {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (sessionId) {
    headers['Cookie'] = `sessionId=${sessionId}`;
  }

  async function request<T>(path: string, init: RequestInit): Promise<T> {
    const url = new URL(path, baseUrl);
    const res = await fetch(url, {
      ...init,
      headers: { ...headers, ...init.headers },
      redirect: 'manual',
    });

    if (res.status === 401) {
      throw new Error('Unauthorized: session expired. Please run `iori login` again.');
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text}`);
    }

    return res.json() as Promise<T>;
  }

  return {
    get<T>(path: string, params?: Record<string, string>): Promise<T> {
      const url = params ? `${path}?${new URLSearchParams(params)}` : path;
      return request(url, { method: 'GET' });
    },

    postJson<T>(path: string, body: unknown): Promise<T> {
      return request(path, {
        method: 'POST',
        body: JSON.stringify(body),
      });
    },

    del<T>(path: string, body?: unknown): Promise<T> {
      return request(path, {
        method: 'DELETE',
        body: body ? JSON.stringify(body) : undefined,
      });
    },

    async getResponse(path: string, init?: RequestInit): Promise<Response> {
      const url = new URL(path, baseUrl);
      return fetch(url, {
        ...init,
        headers: { ...headers, ...init?.headers },
        redirect: 'manual',
      });
    },
  };
}
