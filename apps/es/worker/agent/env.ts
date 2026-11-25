export type AiBinding = Readonly<{
  run: (model: string, inputs: Record<string, unknown>) => Promise<unknown>;
}>;

export type RateLimitBinding = Readonly<{
  limit: (options: { key: string }) => Promise<{ success: boolean }>;
}>;

export type AgentEnv = Readonly<{
  AI?: AiBinding;
  AGENT_PASSWORD?: string;
  AGENT_MODEL?: string;
  AGENT_RATE_LIMIT?: RateLimitBinding;
  AGENT_AUTH_FAILURE_LIMIT?: RateLimitBinding;
}>;
