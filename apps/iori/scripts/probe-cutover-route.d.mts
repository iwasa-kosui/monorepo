export function probeCutoverRoute(
  input: { env: Record<string, string | undefined>; startedAt: number; signal: AbortSignal },
  dependencies?: {
    setup?: (env: Record<string, string | undefined>) => any;
    loadTarget?: (path: string | undefined) => Promise<any>;
    storageFactory?: (...args: any[]) => any;
    readRecord?: (input: any) => Promise<any>;
    readSealed?: (input: any) => Promise<any>;
    readVersion?: (input: any) => Promise<string>;
    terraformFactory?: (input: any) => any;
    transition?: (input: any) => Promise<any>;
    smoke?: (input: any) => Promise<any>;
    onStage?: (stage: string) => void;
  },
): Promise<{ probed: true }>;
